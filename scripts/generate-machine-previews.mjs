import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = process.cwd()
const sourceDir = join(rootDir, 'public', 'dxf-machines')
const outputDir = join(rootDir, 'public', 'dxf-machines-preview')

const PREVIEW_PROFILE = {
  name: 'mvp-balanced-v1',
  simplifyToleranceFactor: 0.0028,
  minLengthFactor: 0.045,
  minAreaFactor: 0.018,
  maxPolylines: 72,
  minStrokeWidth: 0.65,
  strokeWidthFactor: 0.012,
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const files = readdirSync(sourceDir)
  .filter((file) => file.endsWith('.svg'))
  .sort((left, right) => left.localeCompare(right))

const manifest = []

for (const file of files) {
  const sourcePath = join(sourceDir, file)
  const svg = readFileSync(sourcePath, 'utf-8')
  const previewResult = buildPreview(svg)
  const previewPath = join(outputDir, file)

  writeFileSync(previewPath, previewResult.svg, 'utf-8')

  manifest.push({
    file,
    previewUrl: `/dxf-machines-preview/${file}`,
    width: previewResult.width,
    height: previewResult.height,
    sourcePathCount: previewResult.sourcePathCount,
    previewPolylineCount: previewResult.previewPolylineCount,
    sourceBytes: statSync(sourcePath).size,
    previewBytes: statSync(previewPath).size,
    profile: PREVIEW_PROFILE.name,
  })
}

writeFileSync(
  join(outputDir, 'manifest.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      profile: PREVIEW_PROFILE,
      files: manifest,
    },
    null,
    2,
  ),
  'utf-8',
)

function buildPreview(svg) {
  const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
  const width = viewBoxMatch ? Number.parseFloat(viewBoxMatch[1]) : 100
  const height = viewBoxMatch ? Number.parseFloat(viewBoxMatch[2]) : 100
  const maxDimension = Math.max(width, height)
  const pathMatches = [...svg.matchAll(/<path d="([^"]+)"/g)]

  const simplifiedPolylines = pathMatches
    .flatMap((match) => parsePathPolylines(match[1]))
    .map((polyline) =>
      simplifyPolyline(polyline, maxDimension * PREVIEW_PROFILE.simplifyToleranceFactor),
    )
    .filter((polyline) => isMeaningfulPolyline(polyline, maxDimension))
    .sort((left, right) => polylineScore(right) - polylineScore(left))
    .slice(0, PREVIEW_PROFILE.maxPolylines)

  const pathData = simplifiedPolylines.map(polylineToPath).filter(Boolean).join(' ')
  const strokeWidth = Math.max(
    maxDimension * PREVIEW_PROFILE.strokeWidthFactor,
    PREVIEW_PROFILE.minStrokeWidth,
  ).toFixed(3)

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">`,
    `  <path d="${pathData}" stroke="#1495ff" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`,
    '</svg>',
  ].join('\n')

  return {
    svg: svgMarkup,
    width,
    height,
    sourcePathCount: pathMatches.length,
    previewPolylineCount: simplifiedPolylines.length,
  }
}

function parsePathPolylines(pathData) {
  const tokens = pathData.match(/[MLZ]|-?\d*\.?\d+/g)
  if (!tokens) {
    return []
  }

  const polylines = []
  let index = 0
  let command = ''
  let currentPoints = []

  while (index < tokens.length) {
    const token = tokens[index]

    if (token === 'M' || token === 'L' || token === 'Z') {
      command = token
      index += 1

      if (command === 'Z') {
        pushPolyline(polylines, currentPoints, true)
        currentPoints = []
      }
      continue
    }

    if (command !== 'M' && command !== 'L') {
      index += 1
      continue
    }

    const x = Number.parseFloat(tokens[index] ?? '0')
    const y = Number.parseFloat(tokens[index + 1] ?? '0')
    const point = { x, y }

    if (command === 'M') {
      pushPolyline(polylines, currentPoints, false)
      currentPoints = [point]
      command = 'L'
      index += 2
      continue
    }

    currentPoints.push(point)
    index += 2
  }

  pushPolyline(polylines, currentPoints, false)
  return polylines
}

function pushPolyline(polylines, points, closed) {
  const uniquePoints = dedupePoints(points)
  if (uniquePoints.length < 2) {
    return
  }

  polylines.push({ points: uniquePoints, closed })
}

function simplifyPolyline(polyline, tolerance) {
  const points = dedupePoints(polyline.points)
  if (points.length < 3) {
    return { ...polyline, points }
  }

  return {
    ...polyline,
    points: dedupePoints(simplifyPointsDouglasPeucker(points, tolerance)),
  }
}

function simplifyPointsDouglasPeucker(points, tolerance) {
  if (points.length < 3) {
    return points
  }

  const first = points[0]
  const last = points[points.length - 1]
  let maxDistance = 0
  let maxIndex = 0

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance <= tolerance) {
    return [first, last]
  }

  const left = simplifyPointsDouglasPeucker(points.slice(0, maxIndex + 1), tolerance)
  const right = simplifyPointsDouglasPeucker(points.slice(maxIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return distanceBetweenPoints(point, lineStart)
  }

  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  )
  const denominator = Math.sqrt(dx * dx + dy * dy)
  return numerator / denominator
}

function isMeaningfulPolyline(polyline, maxDimension) {
  const { points } = polyline
  let totalLength = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)

    if (index > 0) {
      totalLength += distanceBetweenPoints(points[index - 1], point)
    }
  }

  const bboxWidth = maxX - minX
  const bboxHeight = maxY - minY
  const area = bboxWidth * bboxHeight
  const minLength = maxDimension * PREVIEW_PROFILE.minLengthFactor
  const minArea = Math.pow(maxDimension * PREVIEW_PROFILE.minAreaFactor, 2)

  return totalLength >= minLength || area >= minArea
}

function polylineScore(polyline) {
  const { points } = polyline
  let totalLength = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)

    if (index > 0) {
      totalLength += distanceBetweenPoints(points[index - 1], point)
    }
  }

  return totalLength + (maxX - minX) * (maxY - minY) * 0.35
}

function polylineToPath(polyline) {
  if (polyline.points.length < 2) {
    return ''
  }

  const commands = [`M ${formatPoint(polyline.points[0])}`]

  for (let index = 1; index < polyline.points.length; index += 1) {
    commands.push(`L ${formatPoint(polyline.points[index])}`)
  }

  if (polyline.closed) {
    commands.push('Z')
  }

  return commands.join(' ')
}

function formatPoint(point) {
  return `${roundValue(point.x)} ${roundValue(point.y)}`
}

function dedupePoints(points) {
  const result = []

  for (const point of points) {
    const previous = result[result.length - 1]
    if (!previous || distanceBetweenPoints(previous, point) > 0.0005) {
      result.push(point)
    }
  }

  return result
}

function distanceBetweenPoints(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function roundValue(value) {
  return Number.parseFloat(value.toFixed(3))
}
