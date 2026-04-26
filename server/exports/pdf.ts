import { readFileSync } from 'fs'
import { join } from 'path'
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import type { Project } from '../../shared/domain/contracts.js'
import { getCatalogItem, getTemplate } from '../../shared/domain/catalog.js'
import { getPlacementBounds } from '../../shared/domain/geometry.js'
import {
  getMachineFullGeometryByCatalogId,
} from '../../shared/domain/machine-visuals.js'

interface Point {
  x: number
  y: number
}

interface SvgSegment {
  start: Point
  end: Point
}

interface SvgPolyline {
  points: Point[]
  closed: boolean
}

interface SvgGeometry {
  width: number
  height: number
  segments: SvgSegment[]
}

const svgGeometryCache = new Map<string, SvgGeometry>()

export async function buildProjectPdf(project: Project) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([1190, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margin = 36
  const sidePanelWidth = 280
  const drawWidth = page.getWidth() - margin * 2 - sidePanelWidth
  const drawHeight = page.getHeight() - margin * 2
  const scale = Math.min(drawWidth / project.room.width, drawHeight / project.room.length)
  const roomWidth = project.room.width * scale
  const roomHeight = project.room.length * scale
  const originX = margin
  const originY = page.getHeight() - margin - roomHeight

  page.drawText(sanitizePdfText(project.title), {
    x: margin,
    y: page.getHeight() - 24,
    size: 18,
    font: boldFont,
  })

  page.drawRectangle({
    x: originX,
    y: originY,
    width: roomWidth,
    height: roomHeight,
    borderColor: rgb(0.1, 0.12, 0.16),
    borderWidth: 2,
  })

  page.drawText(
    sanitizePdfText(
      `Цех: ${project.room.width.toLocaleString('ru-RU')} x ${project.room.length.toLocaleString('ru-RU')} мм`,
    ),
    {
      x: originX,
      y: originY + roomHeight + 10,
      size: 10,
      font,
    },
  )

  for (const placement of project.placements) {
    drawPlacement(page, project, placement, originX, originY, scale, boldFont)
  }

  drawSidePanel(page, {
    x: page.getWidth() - sidePanelWidth + 8,
    y: page.getHeight() - 60,
    width: sidePanelWidth - 16,
    font,
    boldFont,
    project,
  })

  return pdf.save()
}

function drawPlacement(
  page: PDFPage,
  project: Project,
  placement: Project['placements'][number],
  originX: number,
  originY: number,
  scale: number,
  boldFont: PDFFont,
) {
  const geometry = loadPlacementGeometry(placement.catalogId)

  if (!geometry) {
    const bounds = getPlacementBounds(placement)
    const x = originX + bounds.x * scale
    const y = originY + (project.room.length - (bounds.y + bounds.height)) * scale
    const color = hexToRgb(placement.color)

    page.drawRectangle({
      x,
      y,
      width: bounds.width * scale,
      height: bounds.height * scale,
      color,
      borderColor: rgb(0.1, 0.12, 0.16),
      borderWidth: 1.2,
    })

    page.drawText(sanitizePdfText(placement.label), {
      x: x + 4,
      y: y + bounds.height * scale - 14,
      size: 8,
      font: boldFont,
      color: rgb(1, 1, 1),
      maxWidth: Math.max(40, bounds.width * scale - 8),
    })
    return
  }

  const scaleFactor = Math.min(
    placement.width / geometry.width,
    placement.length / geometry.height,
  )
  const strokeColor = rgb(0.04, 0.67, 0.96)

  for (const segment of geometry.segments) {
    const start = transformSvgPointToPage(
      segment.start,
      project,
      placement,
      geometry,
      scaleFactor,
      originX,
      originY,
      scale,
    )
    const end = transformSvgPointToPage(
      segment.end,
      project,
      placement,
      geometry,
      scaleFactor,
      originX,
      originY,
      scale,
    )

    page.drawLine({
      start,
      end,
      thickness: 0.8,
      color: strokeColor,
      opacity: 0.95,
    })
  }

  const labelPoint = transformSvgPointToPage(
    { x: geometry.width * 0.04, y: geometry.height * 0.12 },
    project,
    placement,
    geometry,
    scaleFactor,
    originX,
    originY,
    scale,
  )

  page.drawText(sanitizePdfText(placement.label), {
    x: labelPoint.x + 2,
    y: labelPoint.y + 6,
    size: 8,
    font: boldFont,
    color: rgb(0.95, 0.98, 1),
    maxWidth: Math.max(56, placement.width * scale * 0.82),
  })
}

function drawSidePanel(
  page: PDFPage,
  options: {
    x: number
    y: number
    width: number
    font: PDFFont
    boldFont: PDFFont
    project: Project
  },
) {
  const { x, y, width, font, boldFont, project } = options
  let cursorY = y

  cursorY = drawSection(
    page,
    x,
    cursorY,
    width,
    'Проект',
    [
      `Режим: ${project.mode === 'ai' ? 'AI' : 'ручной'}`,
      `Статус: ${project.status}`,
      `Шаблон: ${getTemplate(project.templateId)?.name ?? 'не выбран'}`,
    ],
    font,
    boldFont,
  )

  cursorY = drawSection(
    page,
    x,
    cursorY,
    width,
    'Состав',
    project.items.map((item) => {
      const catalog = getCatalogItem(item.catalogId)
      return `${catalog?.code ?? item.catalogId} x${item.quantity}`
    }),
    font,
    boldFont,
  )

  drawSection(
    page,
    x,
    cursorY,
    width,
    'Предупреждения',
    project.warnings.length > 0 ? project.warnings : ['Нет конфликтов'],
    font,
    boldFont,
  )
}

function drawSection(
  page: PDFPage,
  x: number,
  startY: number,
  width: number,
  title: string,
  lines: string[],
  font: PDFFont,
  boldFont: PDFFont,
) {
  let cursorY = startY

  page.drawText(sanitizePdfText(title), {
    x,
    y: cursorY,
    size: 11,
    font: boldFont,
  })
  cursorY -= 16

  for (const line of lines.slice(0, 12)) {
    page.drawText(sanitizePdfText(line), {
      x,
      y: cursorY,
      size: 8.5,
      font,
      maxWidth: width,
      lineHeight: 10,
    })
    cursorY -= 12
  }

  return cursorY - 10
}

function sanitizePdfText(value: string) {
  return transliterate(value)
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function loadPlacementGeometry(catalogId: string) {
  const geometryAsset = getMachineFullGeometryByCatalogId(catalogId)

  if (!geometryAsset) {
    return null
  }

  const cached = svgGeometryCache.get(geometryAsset.fileName)
  if (cached) {
    return cached
  }

  const svgPath = join(process.cwd(), 'public', 'dxf-machines', geometryAsset.fileName)
  const svg = readFileSync(svgPath, 'utf-8')
  const geometry = parseSvgGeometry(svg, geometryAsset.width, geometryAsset.height)
  svgGeometryCache.set(geometryAsset.fileName, geometry)
  return geometry
}

function parseSvgGeometry(svg: string, fallbackWidth: number, fallbackHeight: number): SvgGeometry {
  const widthMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : fallbackWidth
  const height = widthMatch ? Number.parseFloat(widthMatch[2]) : fallbackHeight
  const pathMatches = [...svg.matchAll(/<path d="([^"]+)"/g)]
  const simplifyTolerance = Math.max(width, height) * 0.0008
  const segments = pathMatches.flatMap((match) =>
    parsePathSegments(match[1], simplifyTolerance),
  )
  return { width, height, segments }
}

function parsePathSegments(pathData: string, simplifyTolerance: number) {
  return parsePathPolylines(pathData).flatMap((polyline) =>
    polylineToSegments(simplifyPolyline(polyline, simplifyTolerance)),
  )
}

function parsePathPolylines(pathData: string) {
  const tokens = pathData.match(/[MLZ]|-?\d*\.?\d+/g)
  if (!tokens) {
    return []
  }

  const polylines: SvgPolyline[] = []
  let index = 0
  let command = ''
  let currentPoints: Point[] = []

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
    const nextPoint = point(x, y)

    if (command === 'M') {
      pushPolyline(polylines, currentPoints, false)
      currentPoints = [nextPoint]
      command = 'L'
      index += 2
      continue
    }

    currentPoints.push(nextPoint)
    index += 2
  }

  pushPolyline(polylines, currentPoints, false)
  return polylines
}

function pushPolyline(polylines: SvgPolyline[], points: Point[], closed: boolean) {
  if (points.length < 2) {
    return
  }

  polylines.push({
    points: points.map((currentPoint) => ({ ...currentPoint })),
    closed,
  })
}

function simplifyPolyline(polyline: SvgPolyline, tolerance: number) {
  if (polyline.points.length <= 2) {
    return polyline
  }

  const closedPoints = polyline.closed
    ? [...polyline.points, polyline.points[0]]
    : polyline.points

  const simplified = simplifyPoints(closedPoints, tolerance)
  const normalizedPoints =
    polyline.closed && simplified.length > 1
      ? simplified.slice(0, -1)
      : simplified

  if (normalizedPoints.length < 2) {
    return {
      points: polyline.points.slice(0, 2),
      closed: polyline.closed,
    }
  }

  return {
    points: normalizedPoints,
    closed: polyline.closed,
  }
}

function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return points.map((currentPoint) => ({ ...currentPoint }))
  }

  const first = points[0]
  const last = points[points.length - 1]
  let maxDistance = 0
  let splitIndex = 0

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      splitIndex = index
    }
  }

  if (maxDistance <= tolerance) {
    return [{ ...first }, { ...last }]
  }

  const left = simplifyPoints(points.slice(0, splitIndex + 1), tolerance)
  const right = simplifyPoints(points.slice(splitIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function perpendicularDistance(pointValue: Point, lineStart: Point, lineEnd: Point) {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return Math.hypot(pointValue.x - lineStart.x, pointValue.y - lineStart.y)
  }

  const numerator = Math.abs(
    dy * pointValue.x -
      dx * pointValue.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x,
  )
  const denominator = Math.hypot(dx, dy)
  return numerator / denominator
}

function polylineToSegments(polyline: SvgPolyline) {
  const segments: SvgSegment[] = []

  for (let index = 1; index < polyline.points.length; index += 1) {
    segments.push({
      start: polyline.points[index - 1],
      end: polyline.points[index],
    })
  }

  if (polyline.closed) {
    segments.push({
      start: polyline.points[polyline.points.length - 1],
      end: polyline.points[0],
    })
  }

  return segments
}

function transformSvgPointToPage(
  svgPoint: Point,
  project: Project,
  placement: Project['placements'][number],
  geometry: SvgGeometry,
  scaleFactor: number,
  originX: number,
  originY: number,
  scale: number,
) {
  const dx = (svgPoint.x - geometry.width / 2) * scaleFactor
  const dy = (svgPoint.y - geometry.height / 2) * scaleFactor
  const rotated =
    placement.rotation === 90
      ? {
          x: -dy,
          y: dx,
        }
      : {
          x: dx,
          y: dy,
        }

  const roomX = placement.x + rotated.x
  const roomY = placement.y + rotated.y

  return {
    x: originX + roomX * scale,
    y: originY + (project.room.length - roomY) * scale,
  }
}

function point(x: number, y: number): Point {
  return { x, y }
}

function transliterate(value: string) {
  const lookup: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  return Array.from(value)
    .map((char) => {
      const lower = char.toLowerCase()
      const replacement = lookup[lower]

      if (!replacement) {
        return char
      }

      return char === lower
        ? replacement
        : `${replacement.slice(0, 1).toUpperCase()}${replacement.slice(1)}`
    })
    .join('')
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')

  if (normalized.length !== 6) {
    return rgb(0.4, 0.4, 0.4)
  }

  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  )
}
