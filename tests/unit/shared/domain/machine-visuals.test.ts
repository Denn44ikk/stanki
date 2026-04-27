import { describe, expect, it } from 'vitest'
import {
  getMachineCanvasAssetByCatalogId,
  getMachineFullGeometryByCatalogId,
  getMachinePreviewByCatalogId,
} from '../../../../shared/domain/machine-visuals.js'

describe('machine-visuals', () => {
  it('uses lightweight preview assets for the working canvas', () => {
    const preview = getMachinePreviewByCatalogId('b700')
    const canvasAsset = getMachineCanvasAssetByCatalogId('b700')

    expect(preview).toBeTruthy()
    expect(canvasAsset).toEqual(preview)
    expect(canvasAsset?.url.endsWith('.png')).toBe(true)
  })

  it('keeps full svg geometry available for exports', () => {
    const fullGeometry = getMachineFullGeometryByCatalogId('b700')

    expect(fullGeometry).toBeTruthy()
    expect(fullGeometry?.url.endsWith('.svg')).toBe(true)
    expect(fullGeometry?.fileName.endsWith('.svg')).toBe(true)
  })

  it('returns null for unknown catalog ids', () => {
    expect(getMachinePreviewByCatalogId('unknown-machine')).toBeNull()
    expect(getMachineCanvasAssetByCatalogId('unknown-machine')).toBeNull()
    expect(getMachineFullGeometryByCatalogId('unknown-machine')).toBeNull()
  })
})
