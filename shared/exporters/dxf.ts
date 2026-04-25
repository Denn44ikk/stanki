import { getPlacementBounds } from '../domain/geometry.js'
import type { LayoutPlacement, RoomSpec } from '../domain/contracts.js'

interface Point {
  x: number
  y: number
}

interface CadRect {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

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
    const machineRect = toCadRect(room, getPlacementBounds(placement))
    const safetyRect = {
      left: machineRect.left - placement.safetyZone,
      right: machineRect.right + placement.safetyZone,
      top: machineRect.top + placement.safetyZone,
      bottom: machineRect.bottom - placement.safetyZone,
      width: machineRect.width + placement.safetyZone * 2,
      height: machineRect.height + placement.safetyZone * 2,
    }

    appendRectangle(entities, 'SAFETY', safetyRect)
    appendRectangle(entities, 'EQUIPMENT', machineRect)
    entities.push(
      textEntity(
        'TEXT',
        point(machineRect.left + 60, machineRect.top + 90),
        100,
        sanitizeCadText(placement.label),
      ),
      textEntity(
        'TEXT',
        point(machineRect.left + 60, machineRect.bottom + 90),
        80,
        `${formatMillimeters(machineRect.width)} x ${formatMillimeters(machineRect.height)} MM`,
      ),
    )
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
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
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
