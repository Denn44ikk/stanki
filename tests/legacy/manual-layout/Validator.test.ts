import { describe, expect, it } from 'vitest'
import {
  findSafetyIntersections,
  getMachineBounds,
  getNearestWallDistances,
  getSafetyBounds,
  isOutOfRoom,
} from '../../../src/legacy/manual-layout/Validator'
import type {
  PlacedMachine,
  Room,
} from '../../../src/legacy/manual-layout/types'

const room: Room = {
  width: 9000,
  length: 6000,
}

function createMachine(overrides: Partial<PlacedMachine> = {}): PlacedMachine {
  return {
    instanceId: overrides.instanceId ?? 'machine-1',
    machineId: overrides.machineId ?? 'lathe-1',
    name: overrides.name ?? 'Токарный станок',
    width: overrides.width ?? 1200,
    length: overrides.length ?? 2400,
    color: overrides.color ?? '#2563eb',
    safetyZone: overrides.safetyZone ?? 800,
    rotation: overrides.rotation ?? 0,
    x: overrides.x ?? 3000,
    y: overrides.y ?? 3000,
  }
}

describe('Validator', () => {
  it('builds machine bounds from center coordinates', () => {
    const machine = createMachine()

    expect(getMachineBounds(machine)).toEqual({
      x: 2400,
      y: 1800,
      width: 1200,
      height: 2400,
    })
  })

  it('expands safety bounds on all sides', () => {
    const machine = createMachine()

    expect(getSafetyBounds(machine)).toEqual({
      x: 1600,
      y: 1000,
      width: 2800,
      height: 4000,
    })
  })

  it('detects when a machine leaves the room', () => {
    const machine = createMachine({ x: 500 })

    expect(isOutOfRoom(machine, room)).toBe(true)
  })

  it('reports intersections between safety zones', () => {
    const firstMachine = createMachine({
      instanceId: 'machine-a',
      x: 2500,
      y: 3000,
    })
    const secondMachine = createMachine({
      instanceId: 'machine-b',
      machineId: 'milling-1',
      name: 'Фрезерный станок',
      x: 4100,
      y: 3000,
    })

    const warnings = findSafetyIntersections([firstMachine, secondMachine])

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      machineIds: ['machine-a', 'machine-b'],
    })
  })

  it('returns nearest wall distances for dimension lines', () => {
    const machine = createMachine({ x: 2200, y: 1600 })

    expect(getNearestWallDistances(machine, room)).toEqual({
      left: 1600,
      right: 6200,
      top: 400,
      bottom: 3200,
      nearestX: {
        wall: 'left',
        distance: 1600,
      },
      nearestY: {
        wall: 'top',
        distance: 400,
      },
    })
  })
})
