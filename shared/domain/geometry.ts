import type { LayoutPlacement, Rotation, RoomSpec } from './contracts.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CollisionWarning {
  id: string
  placementIds: [string, string]
  message: string
}

export interface AxisDistance<Wall extends string> {
  wall: Wall
  distance: number
}

export interface NearestWallDistances {
  left: number
  right: number
  top: number
  bottom: number
  nearestX: AxisDistance<'left' | 'right'>
  nearestY: AxisDistance<'top' | 'bottom'>
}

export function getFootprintSize(
  width: number,
  length: number,
  rotation: Rotation,
) {
  return rotation === 90
    ? { width: length, height: width }
    : { width, height: length }
}

export function getPlacementBounds(placement: LayoutPlacement): Rect {
  const footprint = getFootprintSize(
    placement.width,
    placement.length,
    placement.rotation,
  )

  return {
    x: placement.x - footprint.width / 2,
    y: placement.y - footprint.height / 2,
    width: footprint.width,
    height: footprint.height,
  }
}

export function getSafetyBounds(placement: LayoutPlacement): Rect {
  const bounds = getPlacementBounds(placement)

  return {
    x: bounds.x - placement.safetyZone,
    y: bounds.y - placement.safetyZone,
    width: bounds.width + placement.safetyZone * 2,
    height: bounds.height + placement.safetyZone * 2,
  }
}

export function isPlacementOutOfRoom(
  placement: LayoutPlacement,
  room: RoomSpec,
) {
  const bounds = getPlacementBounds(placement)

  return (
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > room.width ||
    bounds.y + bounds.height > room.length
  )
}

export function findSafetyIntersections(placements: LayoutPlacement[]) {
  const warnings: CollisionWarning[] = []

  for (let index = 0; index < placements.length; index += 1) {
    for (
      let compareIndex = index + 1;
      compareIndex < placements.length;
      compareIndex += 1
    ) {
      const first = placements[index]
      const second = placements[compareIndex]

      if (rectanglesOverlap(getSafetyBounds(first), getSafetyBounds(second))) {
        warnings.push({
          id: `${first.id}-${second.id}`,
          placementIds: [first.id, second.id],
          message: `Зоны безопасности "${first.label}" и "${second.label}" пересекаются.`,
        })
      }
    }
  }

  return warnings
}

export function getNearestWallDistances(
  placement: LayoutPlacement,
  room: RoomSpec,
): NearestWallDistances {
  const bounds = getPlacementBounds(placement)
  const left = bounds.x
  const right = room.width - (bounds.x + bounds.width)
  const top = bounds.y
  const bottom = room.length - (bounds.y + bounds.height)

  return {
    left,
    right,
    top,
    bottom,
    nearestX:
      left <= right
        ? { wall: 'left', distance: left }
        : { wall: 'right', distance: right },
    nearestY:
      top <= bottom
        ? { wall: 'top', distance: top }
        : { wall: 'bottom', distance: bottom },
  }
}

function rectanglesOverlap(firstRect: Rect, secondRect: Rect) {
  return (
    firstRect.x < secondRect.x + secondRect.width &&
    firstRect.x + firstRect.width > secondRect.x &&
    firstRect.y < secondRect.y + secondRect.height &&
    firstRect.y + firstRect.height > secondRect.y
  )
}
