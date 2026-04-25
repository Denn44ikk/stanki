export interface Room {
  width: number
  length: number
}

export interface MachineCatalogItem {
  id: string
  name: string
  width: number
  length: number
  color: string
  safetyZone: number
}

export interface PlacedMachine {
  instanceId: string
  machineId: string
  name: string
  width: number
  length: number
  color: string
  safetyZone: number
  rotation: 0 | 90
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CollisionWarning {
  id: string
  machineIds: [string, string]
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

export interface ValidationState {
  collisions: CollisionWarning[]
  collisionIds: Set<string>
  outOfBoundsIds: Set<string>
}

export interface WarningItem {
  id: string
  tone: 'warning' | 'critical'
  message: string
}
