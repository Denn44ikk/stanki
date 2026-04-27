export interface MachinePreviewAsset {
  url: string
  width: number
  height: number
}

export interface MachineFullGeometryAsset {
  url: string
  fileName: string
  width: number
  height: number
}

export interface MachineVisualDefinition {
  id: string
  title: string
  note: string
  preview: MachinePreviewAsset
  fullGeometry: MachineFullGeometryAsset
}

export const DXF_MACHINE_VISUALS: MachineVisualDefinition[] = [
  {
    id: 'U44',
    title: 'U44',
    note: 'Long transport module',
    preview: { url: '/dxf-machines-preview/U44.png', width: 84.989, height: 10.23 },
    fullGeometry: { url: '/dxf-machines/U44.svg', fileName: 'U44.svg', width: 84.989, height: 10.23 },
  },
  {
    id: 'U47',
    title: 'U47',
    note: 'Input / feed module',
    preview: { url: '/dxf-machines-preview/U47.png', width: 60.435, height: 9.618 },
    fullGeometry: { url: '/dxf-machines/U47.svg', fileName: 'U47.svg', width: 60.435, height: 9.618 },
  },
  {
    id: 'U45',
    title: 'U45',
    note: 'Tall machine block',
    preview: { url: '/dxf-machines-preview/U45.png', width: 35.074, height: 46.04 },
    fullGeometry: { url: '/dxf-machines/U45.svg', fileName: 'U45.svg', width: 35.074, height: 46.04 },
  },
  {
    id: 'U46',
    title: 'U46',
    note: 'Sorting / complete module',
    preview: { url: '/dxf-machines-preview/U46.png', width: 34.757, height: 17.821 },
    fullGeometry: { url: '/dxf-machines/U46.svg', fileName: 'U46.svg', width: 34.757, height: 17.821 },
  },
  {
    id: 'U49',
    title: 'U49',
    note: 'Small conveyor',
    preview: { url: '/dxf-machines-preview/U49.png', width: 30, height: 11.348 },
    fullGeometry: { url: '/dxf-machines/U49.svg', fileName: 'U49.svg', width: 30, height: 11.348 },
  },
  {
    id: 'U43',
    title: 'U43',
    note: 'Compact processing unit',
    preview: { url: '/dxf-machines-preview/U43.png', width: 26.261, height: 20.04 },
    fullGeometry: { url: '/dxf-machines/U43.svg', fileName: 'U43.svg', width: 26.261, height: 20.04 },
  },
  {
    id: 'U48',
    title: 'U48',
    note: 'Table / support module',
    preview: { url: '/dxf-machines-preview/U48.png', width: 24.271, height: 14.094 },
    fullGeometry: { url: '/dxf-machines/U48.svg', fileName: 'U48.svg', width: 24.271, height: 14.094 },
  },
  {
    id: 'U50',
    title: 'U50',
    note: 'Large machine block',
    preview: { url: '/dxf-machines-preview/U50.png', width: 43.614, height: 31.064 },
    fullGeometry: { url: '/dxf-machines/U50.svg', fileName: 'U50.svg', width: 43.614, height: 31.064 },
  },
  {
    id: 'U54',
    title: 'U54',
    note: 'Rollgang / linear module',
    preview: { url: '/dxf-machines-preview/U54.png', width: 45.93, height: 13.625 },
    fullGeometry: { url: '/dxf-machines/U54.svg', fileName: 'U54.svg', width: 45.93, height: 13.625 },
  },
  {
    id: 'U53',
    title: 'U53',
    note: 'Small machine module',
    preview: { url: '/dxf-machines-preview/U53.png', width: 34, height: 12.775 },
    fullGeometry: { url: '/dxf-machines/U53.svg', fileName: 'U53.svg', width: 34, height: 12.775 },
  },
  {
    id: 'U55',
    title: 'U55',
    note: 'Short conveyor',
    preview: { url: '/dxf-machines-preview/U55.png', width: 30, height: 6.75 },
    fullGeometry: { url: '/dxf-machines/U55.svg', fileName: 'U55.svg', width: 30, height: 6.75 },
  },
  {
    id: 'U52',
    title: 'U52',
    note: 'Compact module',
    preview: { url: '/dxf-machines-preview/U52.png', width: 20.56, height: 16.265 },
    fullGeometry: { url: '/dxf-machines/U52.svg', fileName: 'U52.svg', width: 20.56, height: 16.265 },
  },
  {
    id: 'U51',
    title: 'U51',
    note: 'Small auxiliary module',
    preview: { url: '/dxf-machines-preview/U51.png', width: 11.595, height: 11.348 },
    fullGeometry: { url: '/dxf-machines/U51.svg', fileName: 'U51.svg', width: 11.595, height: 11.348 },
  },
]

export const MACHINE_VISUAL_MAP: Record<string, string> = {
  s750: 'U44',
  topol: 'U44',
  tonkomer: 'U44',
  b700: 'U50',
  m1000: 'U50',
  gs4: 'U45',
  grad: 'U45',
  nb: 'U47',
  pb: 'U47',
  vb: 'U47',
  vr: 'U54',
  rolgang: 'U54',
  tgp: 'U54',
  tkp: 'U54',
  'vr-table': 'U48',
  tcl: 'U46',
  tcp: 'U46',
  prsc: 'U46',
  og: 'U43',
}

const visualById = new Map(DXF_MACHINE_VISUALS.map((visual) => [visual.id, visual]))
const catalogIdsByVisualId = Object.entries(MACHINE_VISUAL_MAP).reduce<Record<string, string[]>>(
  (accumulator, [catalogId, visualId]) => {
    if (!accumulator[visualId]) {
      accumulator[visualId] = []
    }

    accumulator[visualId].push(catalogId)
    return accumulator
  },
  {},
)

export function getMachineVisualByCatalogId(catalogId: string) {
  const visualId = MACHINE_VISUAL_MAP[catalogId]
  return visualId ? visualById.get(visualId) ?? null : null
}

export function getMachinePreviewByCatalogId(catalogId: string) {
  return getMachineVisualByCatalogId(catalogId)?.preview ?? null
}

export function getMachineCanvasAssetByCatalogId(catalogId: string) {
  return getMachineVisualByCatalogId(catalogId)?.preview ?? null
}

export function getMachineFullGeometryByCatalogId(catalogId: string) {
  return getMachineVisualByCatalogId(catalogId)?.fullGeometry ?? null
}

export function getMachineShowcaseVisuals() {
  return DXF_MACHINE_VISUALS
}

export function getCatalogIdsByVisualId(visualId: string) {
  return catalogIdsByVisualId[visualId] ?? []
}

export function getPreferredCatalogIdByVisualId(visualId: string) {
  return catalogIdsByVisualId[visualId]?.[0] ?? null
}
