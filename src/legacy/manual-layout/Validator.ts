import type {
  CollisionWarning,
  NearestWallDistances,
  PlacedMachine,
  Rect,
  Room,
} from './types'

export function getFootprintSize(
  width: number,
  length: number,
  rotation: 0 | 90,
) {
  return rotation === 90
    ? { width: length, height: width }
    : { width, height: length }
}

export function getMachineBounds(machine: PlacedMachine): Rect {
  const footprint = getFootprintSize(
    machine.width,
    machine.length,
    machine.rotation,
  )

  return {
    x: machine.x - footprint.width / 2,
    y: machine.y - footprint.height / 2,
    width: footprint.width,
    height: footprint.height,
  }
}

export function getSafetyBounds(machine: PlacedMachine): Rect {
  const bounds = getMachineBounds(machine)

  return {
    x: bounds.x - machine.safetyZone,
    y: bounds.y - machine.safetyZone,
    width: bounds.width + machine.safetyZone * 2,
    height: bounds.height + machine.safetyZone * 2,
  }
}

export function isOutOfRoom(machine: PlacedMachine, room: Room) {
  const bounds = getMachineBounds(machine)

  return (
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > room.width ||
    bounds.y + bounds.height > room.length
  )
}

export function findSafetyIntersections(machines: PlacedMachine[]) {
  const warnings: CollisionWarning[] = []

  for (let index = 0; index < machines.length; index += 1) {
    for (
      let compareIndex = index + 1;
      compareIndex < machines.length;
      compareIndex += 1
    ) {
      const firstMachine = machines[index]
      const secondMachine = machines[compareIndex]

      if (
        rectanglesOverlap(
          getSafetyBounds(firstMachine),
          getSafetyBounds(secondMachine),
        )
      ) {
        warnings.push({
          id: `${firstMachine.instanceId}-${secondMachine.instanceId}`,
          machineIds: [firstMachine.instanceId, secondMachine.instanceId],
          message: `Зоны безопасности "${firstMachine.name}" и "${secondMachine.name}" пересекаются.`,
        })
      }
    }
  }

  return warnings
}

export function getNearestWallDistances(
  machine: PlacedMachine,
  room: Room,
): NearestWallDistances {
  const bounds = getMachineBounds(machine)
  const left = bounds.x
  const right = room.width - (bounds.x + bounds.width)
  const top = bounds.y
  const bottom = room.length - (bounds.y + bounds.height)

  return {
    left,
    right,
    top,
    bottom,
    nearestX: left <= right ? { wall: 'left', distance: left } : { wall: 'right', distance: right },
    nearestY: top <= bottom ? { wall: 'top', distance: top } : { wall: 'bottom', distance: bottom },
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
