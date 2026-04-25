import {
  getMachineBounds,
  getNearestWallDistances,
  getSafetyBounds,
} from '../Validator'
import type { PlacedMachine, Room } from '../types'

interface DxfExportInput {
  room: Room
  machines: PlacedMachine[]
  selectedId?: string | null
}

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

export function buildFloorPlanDxf({
  room,
  machines,
  selectedId = null,
}: DxfExportInput) {
  const entities: string[] = []
  const selectedMachine =
    machines.find((machine) => machine.instanceId === selectedId) ?? null
  const offset = Math.max(
    500,
    roundToNearest(Math.min(room.width, room.length) * 0.08, 50),
  )

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
    textEntity('TEXT', point(0, room.length + offset * 1.7), 150, 'FLOOR PLAN'),
    textEntity(
      'TEXT',
      point(0, room.length + offset * 1.25),
      110,
      `ROOM ${formatMillimeters(room.width)} x ${formatMillimeters(room.length)} MM`,
    ),
  )

  appendRoomDimensions(entities, room, offset)

  machines.forEach((machine, index) => {
    const machineRect = toCadRect(room, getMachineBounds(machine))
    const safetyRect = toCadRect(room, getSafetyBounds(machine))
    const labelY = machineRect.top + Math.max(90, machineRect.height * 0.16)
    const sizeY = machineRect.bottom + Math.max(90, machineRect.height * 0.12)

    appendRectangle(entities, 'SAFETY', safetyRect)
    appendRectangle(entities, 'EQUIPMENT', machineRect)

    entities.push(
      textEntity(
        'TEXT',
        point(machineRect.left + 60, labelY),
        110,
        buildMachineLabel(machine, index),
      ),
      textEntity(
        'TEXT',
        point(machineRect.left + 60, sizeY),
        90,
        `${formatMillimeters(machineRect.width)} x ${formatMillimeters(machineRect.height)} MM`,
      ),
    )
  })

  if (selectedMachine) {
    appendSelectedMachineDimensions(entities, room, selectedMachine)
  }

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

function appendRoomDimensions(entities: string[], room: Room, offset: number) {
  const horizontalY = -offset
  const verticalX = -offset

  appendDimension(
    entities,
    point(0, horizontalY),
    point(room.width, horizontalY),
    point(0, 0),
    point(room.width, 0),
    point(room.width / 2 - 180, horizontalY + 90),
    `${formatMillimeters(room.width)} MM`,
  )

  appendDimension(
    entities,
    point(verticalX, 0),
    point(verticalX, room.length),
    point(0, 0),
    point(0, room.length),
    point(verticalX - 230, room.length / 2),
    `${formatMillimeters(room.length)} MM`,
  )
}

function appendSelectedMachineDimensions(
  entities: string[],
  room: Room,
  machine: PlacedMachine,
) {
  const bounds = getMachineBounds(machine)
  const cadRect = toCadRect(room, bounds)
  const distances = getNearestWallDistances(machine, room)
  const centerX = roundValue(machine.x)
  const centerY = roundValue(room.length - machine.y)

  const horizontalWallX = distances.nearestX.wall === 'left' ? 0 : room.width
  const horizontalMachineX =
    distances.nearestX.wall === 'left' ? cadRect.left : cadRect.right
  const verticalWallY = distances.nearestY.wall === 'top' ? room.length : 0
  const verticalMachineY =
    distances.nearestY.wall === 'top' ? cadRect.top : cadRect.bottom

  appendDimension(
    entities,
    point(horizontalWallX, centerY),
    point(horizontalMachineX, centerY),
    point(horizontalWallX, centerY - 130),
    point(horizontalMachineX, centerY - 130),
    point(Math.min(horizontalWallX, horizontalMachineX) + 40, centerY - 70),
    `${formatMillimeters(distances.nearestX.distance)} MM`,
  )

  appendDimension(
    entities,
    point(centerX, verticalWallY),
    point(centerX, verticalMachineY),
    point(centerX - 130, verticalWallY),
    point(centerX - 130, verticalMachineY),
    point(centerX - 360, Math.min(verticalWallY, verticalMachineY) + 40),
    `${formatMillimeters(distances.nearestY.distance)} MM`,
  )
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
  entities.push(
    lineEntity('DIMENSIONS', start, end),
    lineEntity('DIMENSIONS', extensionStart, start),
    lineEntity('DIMENSIONS', extensionEnd, end),
    tickEntity(start, Math.abs(start.y - end.y) < Math.abs(start.x - end.x)),
    tickEntity(end, Math.abs(start.y - end.y) < Math.abs(start.x - end.x)),
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
    sanitizeCadText(value),
  ].join('\n')
}

function buildMachineLabel(machine: PlacedMachine, index: number) {
  return `${sanitizeMachineCode(machine.machineId)}-${index + 1}`
}

function sanitizeMachineCode(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'MACHINE'
}

function sanitizeCadText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function toCadRect(
  room: Room,
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

function point(x: number, y: number): Point {
  return {
    x: roundValue(x),
    y: roundValue(y),
  }
}

function formatMillimeters(value: number) {
  return Math.round(value).toString()
}

function roundValue(value: number) {
  return Number.parseFloat(value.toFixed(3))
}

function roundToNearest(value: number, step: number) {
  return Math.round(value / step) * step
}

function formatNumber(value: number) {
  return roundValue(value).toString()
}
