import { readFileSync } from 'fs'
import { join } from 'path'
import { getMachineFullGeometryByCatalogId } from '../domain/machine-visuals.js'
import type { LayoutPlacement, RoomSpec } from '../domain/contracts.js'

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

interface CadRect {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

const svgGeometryCache = new Map<string, SvgGeometry>()

export function buildProjectDxf(input: {
  title: string
  room: RoomSpec
  placements: LayoutPlacement[]
}) {
  const { title, room, placements } = input
  const entities: string[] = []
  const offset = Math.max(500, Math.round(Math.min(room.width, room.length) * 0.08))

  appendRectangle(
    entities,
    'ROOM',
    {
      left: 0,
      right: room.width,
      top: room.length,
      bottom: 0,
      width: room.width,
      height: room.length,
    },
  )

  entities.push(
    textEntity('TEXT', point(0, room.length + offset * 1.6), 150, sanitizeCadText(title)),
    textEntity(
      'TEXT',
      point(0, room.length + offset * 1.2),
      100,
      `ROOM ${formatMillimeters(room.width)} x ${formatMillimeters(room.length)} MM`,
    ),
  )

  appendDimension(
    entities,
    point(0, -offset),
    point(room.width, -offset),
    point(0, 0),
    point(room.width, 0),
    point(room.width / 2 - 180, -offset + 100),
    `${formatMillimeters(room.width)} MM`,
  )

  appendDimension(
    entities,
    point(-offset, 0),
    point(-offset, room.length),
    point(0, 0),
    point(0, room.length),
    point(-offset - 250, room.length / 2),
    `${formatMillimeters(room.length)} MM`,
  )

  placements.forEach((placement) => {
    const geometry = loadPlacementGeometry(placement)

    if (geometry) {
      appendMachineGeometry(entities, room, placement, geometry)
    } else {
      appendPlacementFallback(entities, room, placement)
    }
  })

  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities.flatMap((entity) => entity.split('\n')),
    '0',
    'ENDSEC',
    '0',
    'EOF',
  ].join('\n')
}

function appendMachineGeometry(
  entities: string[],
  room: RoomSpec,
  placement: LayoutPlacement,
  geometry: SvgGeometry,
) {
  const scaleFactor = Math.min(
    placement.width / geometry.width,
    placement.length / geometry.height,
  )

  for (const segment of geometry.segments) {
    const start = transformSvgPointToCad(segment.start, room, placement, geometry, scaleFactor)
    const end = transformSvgPointToCad(segment.end, room, placement, geometry, scaleFactor)
    entities.push(lineEntity('EQUIPMENT', start, end))
  }

  const labelAnchor = transformSvgPointToCad(
    { x: geometry.width * 0.04, y: geometry.height * 0.12 },
    room,
    placement,
    geometry,
    scaleFactor,
  )

  entities.push(
    textEntity(
      'TEXT',
      labelAnchor,
      90,
      sanitizeCadText(placement.label),
    ),
  )
}

function appendPlacementFallback(
  entities: string[],
  room: RoomSpec,
  placement: LayoutPlacement,
) {
  const machineRect = toCadRect(room, {
    x: placement.x - placement.width / 2,
    y: placement.y - placement.length / 2,
    width: placement.width,
    height: placement.length,
  })

  appendRectangle(entities, 'EQUIPMENT', machineRect)
  entities.push(
    textEntity(
      'TEXT',
      point(machineRect.left + 60, machineRect.top + 90),
      100,
      sanitizeCadText(placement.label),
    ),
  )
}

function loadPlacementGeometry(placement: LayoutPlacement) {
  const geometryAsset = getMachineFullGeometryByCatalogId(placement.catalogId)

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
    points: dedupePoints(points),
    closed,
  })
}

function simplifyPolyline(polyline: SvgPolyline, tolerance: number): SvgPolyline {
  const points = dedupePoints(polyline.points)

  if (points.length < 3) {
    return {
      ...polyline,
      points,
    }
  }

  const simplified = simplifyPointsDouglasPeucker(points, tolerance)
  return {
    ...polyline,
    points: dedupePoints(simplified),
  }
}

function simplifyPointsDouglasPeucker(points: Point[], tolerance: number): Point[] {
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

function perpendicularDistance(pointValue: Point, lineStart: Point, lineEnd: Point) {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return distanceBetweenPoints(pointValue, lineStart)
  }

  const numerator = Math.abs(
    dy * pointValue.x - dx * pointValue.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  )
  const denominator = Math.sqrt(dx * dx + dy * dy)
  return numerator / denominator
}

function polylineToSegments(polyline: SvgPolyline) {
  const segments: SvgSegment[] = []
  const points = polyline.points

  for (let index = 0; index < points.length - 1; index += 1) {
    if (!arePointsEqual(points[index], points[index + 1])) {
      segments.push({ start: points[index], end: points[index + 1] })
    }
  }

  if (polyline.closed && points.length > 2 && !arePointsEqual(points[0], points[points.length - 1])) {
    segments.push({
      start: points[points.length - 1],
      end: points[0],
    })
  }

  return segments
}

function dedupePoints(points: Point[]) {
  const result: Point[] = []

  for (const candidate of points) {
    if (!result[result.length - 1] || !arePointsEqual(result[result.length - 1], candidate)) {
      result.push(candidate)
    }
  }

  return result
}

function arePointsEqual(left: Point, right: Point) {
  return distanceBetweenPoints(left, right) <= 0.0005
}

function distanceBetweenPoints(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function transformSvgPointToCad(
  svgPoint: Point,
  room: RoomSpec,
  placement: LayoutPlacement,
  geometry: SvgGeometry,
  scaleFactor: number,
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

  return point(roomX, room.length - roomY)
}

function appendRectangle(entities: string[], layer: string, rect: CadRect) {
  entities.push(
    lineEntity(layer, point(rect.left, rect.bottom), point(rect.right, rect.bottom)),
    lineEntity(layer, point(rect.right, rect.bottom), point(rect.right, rect.top)),
    lineEntity(layer, point(rect.right, rect.top), point(rect.left, rect.top)),
    lineEntity(layer, point(rect.left, rect.top), point(rect.left, rect.bottom)),
  )
}

function appendDimension(
  entities: string[],
  start: Point,
  end: Point,
  extensionStart: Point,
  extensionEnd: Point,
  labelPoint: Point,
  label: string,
) {
  const isHorizontal = start.y === end.y

  entities.push(
    lineEntity('DIMENSIONS', start, end),
    lineEntity('DIMENSIONS', extensionStart, start),
    lineEntity('DIMENSIONS', extensionEnd, end),
    tickEntity(start, isHorizontal),
    tickEntity(end, isHorizontal),
    textEntity('TEXT', labelPoint, 90, label),
  )
}

function lineEntity(layer: string, start: Point, end: Point) {
  return [
    '0',
    'LINE',
    '8',
    layer,
    '10',
    formatNumber(start.x),
    '20',
    formatNumber(start.y),
    '11',
    formatNumber(end.x),
    '21',
    formatNumber(end.y),
  ].join('\n')
}

function tickEntity(pointValue: Point, isHorizontal: boolean) {
  const tickSize = 55

  return lineEntity(
    'DIMENSIONS',
    isHorizontal
      ? point(pointValue.x, pointValue.y - tickSize)
      : point(pointValue.x - tickSize, pointValue.y),
    isHorizontal
      ? point(pointValue.x, pointValue.y + tickSize)
      : point(pointValue.x + tickSize, pointValue.y),
  )
}

function textEntity(layer: string, anchor: Point, height: number, value: string) {
  return [
    '0',
    'TEXT',
    '8',
    layer,
    '10',
    formatNumber(anchor.x),
    '20',
    formatNumber(anchor.y),
    '40',
    formatNumber(height),
    '1',
    value,
  ].join('\n')
}

function toCadRect(
  room: RoomSpec,
  rect: { x: number; y: number; width: number; height: number },
): CadRect {
  const bottom = room.length - (rect.y + rect.height)
  const top = room.length - rect.y

  return {
    left: roundValue(rect.x),
    right: roundValue(rect.x + rect.width),
    top: roundValue(top),
    bottom: roundValue(bottom),
    width: roundValue(rect.width),
    height: roundValue(rect.height),
  }
}

function sanitizeCadText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[А-Яа-яЁё]/g, (symbol) => CYRILLIC_TO_LATIN[symbol] ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A',
  а: 'a',
  Б: 'B',
  б: 'b',
  В: 'V',
  в: 'v',
  Г: 'G',
  г: 'g',
  Д: 'D',
  д: 'd',
  Е: 'E',
  е: 'e',
  Ё: 'E',
  ё: 'e',
  Ж: 'Zh',
  ж: 'zh',
  З: 'Z',
  з: 'z',
  И: 'I',
  и: 'i',
  Й: 'Y',
  й: 'y',
  К: 'K',
  к: 'k',
  Л: 'L',
  л: 'l',
  М: 'M',
  м: 'm',
  Н: 'N',
  н: 'n',
  О: 'O',
  о: 'o',
  П: 'P',
  п: 'p',
  Р: 'R',
  р: 'r',
  С: 'S',
  с: 's',
  Т: 'T',
  т: 't',
  У: 'U',
  у: 'u',
  Ф: 'F',
  ф: 'f',
  Х: 'Kh',
  х: 'kh',
  Ц: 'Ts',
  ц: 'ts',
  Ч: 'Ch',
  ч: 'ch',
  Ш: 'Sh',
  ш: 'sh',
  Щ: 'Sch',
  щ: 'sch',
  Ъ: '',
  ъ: '',
  Ы: 'Y',
  ы: 'y',
  Ь: '',
  ь: '',
  Э: 'E',
  э: 'e',
  Ю: 'Yu',
  ю: 'yu',
  Я: 'Ya',
  я: 'ya',
}

function point(x: number, y: number): Point {
  return { x: roundValue(x), y: roundValue(y) }
}

function roundValue(value: number) {
  return Number.parseFloat(value.toFixed(3))
}

function formatNumber(value: number) {
  return roundValue(value).toString()
}

function formatMillimeters(value: number) {
  return Math.round(value).toString()
}
