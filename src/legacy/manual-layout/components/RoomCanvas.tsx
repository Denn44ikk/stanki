import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import {
  getMachineBounds,
  getNearestWallDistances,
  getSafetyBounds,
} from '../Validator'
import { buildFloorPlanDxf } from '../exporters/dxf'
import type { PlacedMachine, Room, ValidationState } from '../types'

interface RoomCanvasProps {
  room: Room
  machines: PlacedMachine[]
  selectedId: string | null
  validation: ValidationState
  onSelect: (instanceId: string | null) => void
  onMove: (instanceId: string, x: number, y: number) => void
  onRotate: (instanceId: string) => void
}

function RoomCanvas({
  room,
  machines,
  selectedId,
  validation,
  onSelect,
  onMove,
  onRotate,
}: RoomCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = containerRef.current

    if (!node) {
      return
    }

    const updateSize = () => {
      setContainerSize({
        width: node.clientWidth,
        height: node.clientHeight,
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(node)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const stageWidth = Math.max(containerSize.width, 320)
  const stageHeight = Math.max(containerSize.height, 540)
  const framePadding = 52
  const drawableWidth = Math.max(stageWidth - framePadding * 2, 120)
  const drawableHeight = Math.max(stageHeight - framePadding * 2, 120)
  const scale = Math.min(drawableWidth / room.width, drawableHeight / room.length)
  const roomPixelWidth = room.width * scale
  const roomPixelHeight = room.length * scale
  const originX = (stageWidth - roomPixelWidth) / 2
  const originY = (stageHeight - roomPixelHeight) / 2

  const selectedMachine =
    machines.find((machine) => machine.instanceId === selectedId) ?? null

  const handleStageMouseDown = (targetName: string) => {
    if (targetName === 'stage' || targetName === 'room-shell') {
      onSelect(null)
    }
  }

  const handleExportDrawing = () => {
    const stage = stageRef.current

    if (!stage) {
      return
    }

    const dataUrl = stage.toDataURL({
      pixelRatio: 2,
      mimeType: 'image/png',
    })
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 10)

    link.href = dataUrl
    link.download = `floor-plan-${timestamp}.png`
    link.click()
  }

  const handleExportCadDrawing = () => {
    const timestamp = new Date().toISOString().slice(0, 10)
    const dxf = buildFloorPlanDxf({
      room,
      machines,
      selectedId,
    })
    const blob = new Blob([dxf], {
      type: 'application/dxf;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `floor-plan-${timestamp}.dxf`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex min-h-[540px] flex-1 flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/75 shadow-[0_35px_110px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 sm:px-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Область чертежа
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Перетаскивайте станки мышкой, выбирайте по клику и поворачивайте
            двойным кликом.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <LegendChip color="bg-cyan-500" label="Выбран" />
          <LegendChip color="bg-amber-500" label="Пересечение зон" />
          <LegendChip color="bg-rose-500" label="Выход за границы" />
          <button
            type="button"
            onClick={handleExportCadDrawing}
            className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:border-cyan-500 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
          >
            Скачать чертеж DXF
          </button>
          <button
            type="button"
            onClick={handleExportDrawing}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
          >
            Скачать PNG
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.08),_transparent_38%),linear-gradient(180deg,_rgba(241,245,249,0.95),_rgba(226,232,240,0.96))]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:34px_34px]" />

        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          onMouseDown={(event) => {
            const target = event.target
            const targetName =
              target === target.getStage() ? 'stage' : target.name()
            handleStageMouseDown(targetName)
          }}
          className="relative z-10"
        >
          <Layer>
            <Rect
              name="room-shell"
              x={originX}
              y={originY}
              width={roomPixelWidth}
              height={roomPixelHeight}
              fill="#fefbf2"
              stroke="#0f172a"
              strokeWidth={2}
              cornerRadius={26}
              shadowBlur={22}
              shadowColor="rgba(15, 23, 42, 0.08)"
            />

            <Text
              x={originX + 16}
              y={originY + 14}
              text={`Помещение • ${room.width.toLocaleString('ru-RU')} x ${room.length.toLocaleString('ru-RU')} мм`}
              fontSize={14}
              fontFamily="Manrope"
              fill="#475569"
            />

            {machines.map((machine) => {
              const machineBounds = getMachineBounds(machine)
              const safetyBounds = getSafetyBounds(machine)
              const centerX = originX + machine.x * scale
              const centerY = originY + machine.y * scale
              const widthPx = machineBounds.width * scale
              const heightPx = machineBounds.height * scale
              const safetyWidthPx = safetyBounds.width * scale
              const safetyHeightPx = safetyBounds.height * scale
              const isSelected = machine.instanceId === selectedId
              const isOutOfRoom = validation.outOfBoundsIds.has(machine.instanceId)
              const isColliding = validation.collisionIds.has(machine.instanceId)
              const accentColor = isOutOfRoom
                ? '#dc2626'
                : isColliding
                  ? '#d97706'
                  : isSelected
                    ? '#0891b2'
                    : '#0f172a'

              return (
                <Group
                  key={machine.instanceId}
                  x={centerX}
                  y={centerY}
                  draggable
                  onClick={() => onSelect(machine.instanceId)}
                  onTap={() => onSelect(machine.instanceId)}
                  onDblClick={() => onRotate(machine.instanceId)}
                  onDragStart={() => onSelect(machine.instanceId)}
                  onDragMove={(event) => {
                    const nextX = (event.target.x() - originX) / scale
                    const nextY = (event.target.y() - originY) / scale
                    onMove(machine.instanceId, nextX, nextY)
                  }}
                >
                  <Rect
                    x={-safetyWidthPx / 2}
                    y={-safetyHeightPx / 2}
                    width={safetyWidthPx}
                    height={safetyHeightPx}
                    stroke={accentColor}
                    strokeWidth={1.4}
                    dash={[14, 8]}
                    cornerRadius={24}
                    opacity={0.85}
                  />

                  <Rect
                    x={-widthPx / 2}
                    y={-heightPx / 2}
                    width={widthPx}
                    height={heightPx}
                    fill={machine.color}
                    opacity={0.92}
                    stroke={accentColor}
                    strokeWidth={isSelected ? 4 : 2}
                    cornerRadius={18}
                    shadowBlur={isSelected ? 24 : 14}
                    shadowColor={
                      isSelected
                        ? 'rgba(8, 145, 178, 0.34)'
                        : 'rgba(15, 23, 42, 0.14)'
                    }
                  />

                  <Text
                    x={-widthPx / 2 + 12}
                    y={-14}
                    width={Math.max(widthPx - 24, 42)}
                    text={machine.name}
                    fontSize={Math.max(11, Math.min(15, widthPx / 11))}
                    fontFamily="Manrope"
                    fontStyle="700"
                    align="center"
                    fill="#ffffff"
                    listening={false}
                  />

                  <Text
                    x={-widthPx / 2 + 10}
                    y={heightPx / 2 - 24}
                    width={Math.max(widthPx - 20, 40)}
                    text={`${machineBounds.width.toLocaleString('ru-RU')} x ${machineBounds.height.toLocaleString('ru-RU')} мм`}
                    fontSize={11}
                    fontFamily="Manrope"
                    align="center"
                    fill="rgba(255,255,255,0.82)"
                    listening={false}
                  />
                </Group>
              )
            })}

            {selectedMachine ? (
              <DimensionGuides
                machine={selectedMachine}
                room={room}
                originX={originX}
                originY={originY}
                scale={scale}
              />
            ) : null}
          </Layer>
        </Stage>

        <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-lg">
          1 px ~= {Math.max(1, Math.round(1 / scale)).toLocaleString('ru-RU')} мм
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-lg">
          CAD-экспорт: DXF для AutoCAD / КОМПАС
        </div>
      </div>
    </section>
  )
}

interface LegendChipProps {
  color: string
  label: string
}

function LegendChip({ color, label }: LegendChipProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
      <span className={`size-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}

interface DimensionGuidesProps {
  machine: PlacedMachine
  room: Room
  originX: number
  originY: number
  scale: number
}

function DimensionGuides({
  machine,
  room,
  originX,
  originY,
  scale,
}: DimensionGuidesProps) {
  const bounds = getMachineBounds(machine)
  const distances = getNearestWallDistances(machine, room)
  const machineLeft = originX + bounds.x * scale
  const machineRight = originX + (bounds.x + bounds.width) * scale
  const machineTop = originY + bounds.y * scale
  const machineBottom = originY + (bounds.y + bounds.height) * scale
  const centerX = originX + machine.x * scale
  const centerY = originY + machine.y * scale
  const roomRight = originX + room.width * scale
  const roomBottom = originY + room.length * scale
  const horizontalStart =
    distances.nearestX.wall === 'left' ? originX : machineRight
  const horizontalEnd =
    distances.nearestX.wall === 'left' ? machineLeft : roomRight
  const verticalStart =
    distances.nearestY.wall === 'top' ? originY : machineBottom
  const verticalEnd =
    distances.nearestY.wall === 'top' ? machineTop : roomBottom

  return (
    <Group listening={false}>
      <DimensionLine
        x1={horizontalStart}
        y1={centerY}
        x2={horizontalEnd}
        y2={centerY}
        label={`${formatDistance(distances.nearestX.distance)} мм`}
        orientation="horizontal"
      />
      <DimensionLine
        x1={centerX}
        y1={verticalStart}
        x2={centerX}
        y2={verticalEnd}
        label={`${formatDistance(distances.nearestY.distance)} мм`}
        orientation="vertical"
      />
    </Group>
  )
}

interface DimensionLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  orientation: 'horizontal' | 'vertical'
}

function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  label,
  orientation,
}: DimensionLineProps) {
  const midpointX = (x1 + x2) / 2
  const midpointY = (y1 + y2) / 2
  const labelWidth = Math.max(56, label.length * 7.2)
  const labelX =
    orientation === 'horizontal' ? midpointX - labelWidth / 2 - 8 : midpointX + 12
  const labelY =
    orientation === 'horizontal' ? midpointY - 28 : midpointY - 12

  return (
    <>
      <Line
        points={[x1, y1, x2, y2]}
        stroke="#92400e"
        strokeWidth={1.6}
        dash={[8, 6]}
      />
      <Line
        points={
          orientation === 'horizontal'
            ? [x1, y1 - 7, x1, y1 + 7]
            : [x1 - 7, y1, x1 + 7, y1]
        }
        stroke="#92400e"
        strokeWidth={1.4}
      />
      <Line
        points={
          orientation === 'horizontal'
            ? [x2, y2 - 7, x2, y2 + 7]
            : [x2 - 7, y2, x2 + 7, y2]
        }
        stroke="#92400e"
        strokeWidth={1.4}
      />

      <Group x={labelX} y={labelY}>
        <Rect
          width={labelWidth + 16}
          height={24}
          cornerRadius={12}
          fill="#fff7ed"
          stroke="#fdba74"
          strokeWidth={1}
          shadowBlur={10}
          shadowColor="rgba(251, 146, 60, 0.15)"
        />
        <Text
          width={labelWidth + 16}
          height={24}
          text={label}
          fontSize={12}
          fontFamily="Manrope"
          align="center"
          verticalAlign="middle"
          fill="#7c2d12"
        />
      </Group>
    </>
  )
}

function formatDistance(value: number) {
  const rounded = Math.round(value)
  return rounded.toLocaleString('ru-RU')
}

export default RoomCanvas
