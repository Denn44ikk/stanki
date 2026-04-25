import { describe, expect, it } from 'vitest'
import { buildFloorPlanDxf } from '../../../src/legacy/manual-layout/exporters/dxf'
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

describe('buildFloorPlanDxf', () => {
  it('builds a minimal ASCII DXF with ENTITIES only', () => {
    const dxf = buildFloorPlanDxf({
      room,
      machines: [createMachine()],
    })

    expect(dxf.startsWith('0\nSECTION\n2\nENTITIES')).toBe(true)
    expect(dxf).toContain('0\nLINE\n8\nROOM')
    expect(dxf).toContain('0\nLINE\n8\nEQUIPMENT')
    expect(dxf).toContain('0\nLINE\n8\nSAFETY')
    expect(dxf).toContain('0\nLINE\n8\nDIMENSIONS')
    expect(dxf).toContain('0\nTEXT\n8\nTEXT')
    expect(dxf).toContain('1\nFLOOR PLAN')
    expect(dxf).toContain('1\nROOM 9000 x 6000 MM')
    expect(dxf.endsWith('0\nEOF')).toBe(true)
  })

  it('exports machine and safety geometry as simple lines in CAD coordinates', () => {
    const dxf = buildFloorPlanDxf({
      room,
      machines: [createMachine()],
    })

    expect(dxf).toContain('8\nEQUIPMENT\n10\n2400\n20\n1800\n11\n3600\n21\n1800')
    expect(dxf).toContain('8\nEQUIPMENT\n10\n3600\n20\n1800\n11\n3600\n21\n4200')
    expect(dxf).toContain('8\nSAFETY\n10\n1600\n20\n1000\n11\n4400\n21\n1000')
    expect(dxf).toContain('8\nSAFETY\n10\n4400\n20\n1000\n11\n4400\n21\n5000')
    expect(dxf).toContain('1\nLATHE-1-1')
    expect(dxf).toContain('1\n1200 x 2400 MM')
  })

  it('adds selected machine dimensions to nearest walls', () => {
    const machine = createMachine({
      instanceId: 'selected',
      x: 2200,
      y: 1600,
    })

    const dxf = buildFloorPlanDxf({
      room,
      machines: [machine],
      selectedId: 'selected',
    })

    expect(dxf).toContain('1\n9000 MM')
    expect(dxf).toContain('1\n6000 MM')
    expect(dxf).toContain('1\n1600 MM')
    expect(dxf).toContain('1\n400 MM')
  })
})
