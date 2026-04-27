import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import {
  getNearestWallDistances,
  getPlacementBounds,
} from '../../../shared/domain/geometry.js'
import {
  getMachineCanvasAssetByCatalogId,
  type MachinePreviewAsset,
} from '../../../shared/domain/machine-visuals.js'
import type {
  LayoutPlacement,
  RoomSpec,
} from '../../../shared/domain/contracts.js'

interface ProjectCanvasProps {
  title: string
  room: RoomSpec
  placements: LayoutPlacement[]
  warnings: string[]
  selectedPlacementId: string | null
  onSelect: (placementId: string | null) => void
  onMove: (placementId: string, x: number, y: number) => void
  onRotate: (placementId: string) => void
  onExportDxf: () => void
  onExportPdf: () => void
}

function ProjectCanvas({
  title,
  room,
  placements,
  warnings,
  selectedPlacementId,
  onSelect,
  onMove,
  onRotate,
  onExportDxf,
  onExportPdf,
}: ProjectCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)

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

  const viewportWidth = Math.max(containerSize.width, 360)
  const viewportHeight = Math.max(containerSize.height, 560)
  const framePadding = 52
  const drawableWidth = Math.max(viewportWidth - framePadding * 2, 120)
  const drawableHeight = Math.max(viewportHeight - framePadding * 2, 120)
  const baseScale = Math.min(drawableWidth / room.width, drawableHeight / room.length)
  const scale = baseScale * zoom
  const roomPixelWidth = room.width * scale
  const roomPixelHeight = room.length * scale
  const stageWidth = Math.max(viewportWidth, roomPixelWidth + framePadding * 2)
  const stageHeight = Math.max(viewportHeight, roomPixelHeight + framePadding * 2)
  const originX = (stageWidth - roomPixelWidth) / 2
  const originY = (stageHeight - roomPixelHeight) / 2
  const selectedPlacement =
    placements.find((placement) => placement.id === selectedPlacementId) ?? null
  const machineImages = useMachineImages(placements)

  const handleZoomChange = (nextZoom: number) => {
    setZoom(clampZoom(nextZoom))
  }

  const handleStageMouseDown = (targetName: string) => {
    if (targetName === 'stage' || targetName === 'room-shell') {
      onSelect(null)
    }
  }

  const handleExportPreview = () => {
    const stage = stageRef.current

    if (!stage) {
      return
    }

    const link = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 10)

    link.href = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' })
    link.download = `layout-preview-${timestamp}.png`
    link.click()
  }

  return (
    <section className="flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/75 shadow-[0_35px_110px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 sm:px-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Схема проекта
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {title} • редактируйте мышкой, проверяйте конфликты и выгружайте DXF/PDF.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <LegendChip color="bg-cyan-500" label="Выбран" />
          <LegendChip color="bg-rose-500" label="Конфликт / выход" />
          <button
            type="button"
            onClick={onExportDxf}
            className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:border-cyan-500 hover:bg-cyan-100"
          >
            Скачать DXF
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700"
          >
            Скачать PDF
          </button>
          <button
            type="button"
            onClick={handleExportPreview}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700"
          >
            PNG превью
          </button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="border-b border-amber-200/70 bg-amber-50/80 px-5 py-3 text-sm text-amber-900">
          {warnings.slice(0, 3).map((warning) => (
            <span key={warning} className="mr-2 inline-flex rounded-full bg-amber-100 px-3 py-1">
              {warning}
            </span>
          ))}
          {warnings.length > 3 ? (
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-slate-600">
              + ещё {warnings.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.08),_transparent_38%),linear-gradient(180deg,_rgba(241,245,249,0.95),_rgba(226,232,240,0.96))]"
      >
        <div className="relative" style={{ width: stageWidth, height: stageHeight }}>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:36px_36px]" />

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
            onWheel={(event) => {
              if (!(event.evt.ctrlKey || event.evt.metaKey)) {
                return
              }

              event.evt.preventDefault()
              handleZoomChange(
                zoom * (event.evt.deltaY > 0 ? 1 / CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP),
              )
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

              {placements.map((placement) => {
                const centerX = originX + placement.x * scale
                const centerY = originY + placement.y * scale
                const isSelected = placement.id === selectedPlacementId
                const visual = getMachineCanvasAssetByCatalogId(placement.catalogId)
                const visualImage = visual ? machineImages[visual.url] : null
                const imageLayout = getVisualLayoutMetrics(placement, scale)

                return (
                  <Group
                    key={placement.id}
                    x={centerX}
                    y={centerY}
                    draggable
                    onClick={() => onSelect(placement.id)}
                    onTap={() => onSelect(placement.id)}
                    onDblClick={() => onRotate(placement.id)}
                    onDragStart={() => onSelect(placement.id)}
                    onDragEnd={(event) => {
                      const nextX = (event.target.x() - originX) / scale
                      const nextY = (event.target.y() - originY) / scale
                      onMove(placement.id, nextX, nextY)
                    }}
                  >
                    <Group rotation={placement.rotation}>
                      {visualImage ? (
                        <>
                          {isSelected ? (
                            <Rect
                              x={imageLayout.x - 10}
                              y={imageLayout.y - 10}
                              width={imageLayout.width + 20}
                              height={imageLayout.height + 20}
                              stroke="#0891b2"
                              strokeWidth={2}
                              cornerRadius={18}
                              opacity={0.9}
                            />
                          ) : null}
                          <KonvaImage
                            image={visualImage}
                            x={imageLayout.x}
                            y={imageLayout.y}
                            width={imageLayout.width}
                            height={imageLayout.height}
                            opacity={0.98}
                            perfectDrawEnabled={false}
                            shadowForStrokeEnabled={false}
                          />
                          <Rect
                            x={imageLayout.x}
                            y={imageLayout.y}
                            width={imageLayout.width}
                            height={imageLayout.height}
                            fill="rgba(0,0,0,0)"
                          />
                        </>
                      ) : (
                        <Rect
                          x={imageLayout.x}
                          y={imageLayout.y}
                          width={imageLayout.width}
                          height={imageLayout.height}
                          fill={placement.color}
                          opacity={0.94}
                          stroke={isSelected ? '#0891b2' : '#0f172a'}
                          strokeWidth={isSelected ? 4 : 2}
                          cornerRadius={18}
                        />
                      )}
                    </Group>
                  </Group>
                )
              })}

              {selectedPlacement ? (
                <DimensionGuides
                  placement={selectedPlacement}
                  room={room}
                  originX={originX}
                  originY={originY}
                  scale={scale}
                />
              ) : null}
            </Layer>
          </Stage>
        </div>

        <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/92 px-2 py-2 text-xs text-slate-700 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => handleZoomChange(zoom / CANVAS_ZOOM_STEP)}
              className="rounded-full border border-slate-300 px-2 py-1 font-semibold transition hover:border-cyan-400 hover:text-cyan-700"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => handleZoomChange(1)}
              className="rounded-full border border-slate-300 px-3 py-1 font-semibold transition hover:border-cyan-400 hover:text-cyan-700"
            >
              {formatZoomValue(zoom)}
            </button>
            <button
              type="button"
              onClick={() => handleZoomChange(zoom * CANVAS_ZOOM_STEP)}
              className="rounded-full border border-slate-300 px-2 py-1 font-semibold transition hover:border-cyan-400 hover:text-cyan-700"
            >
              +
            </button>
          </div>
          <div className="pointer-events-none rounded-full border border-slate-200/70 bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow">
            Ctrl + wheel для zoom
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-lg">
          1 px ~= {Math.max(1, Math.round(1 / scale)).toLocaleString('ru-RU')} мм
        </div>
      </div>
    </section>
  )
}

function getVisualLayoutMetrics(
  placement: LayoutPlacement,
  scale: number,
) {
  const width = placement.width * scale
  const height = placement.length * scale

  return {
    width,
    height,
    x: -width / 2,
    y: -height / 2,
  }
}

const previewImageCache = new Map<string, HTMLImageElement>()

function useMachineImages(placements: LayoutPlacement[]) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})

  const visuals = useMemo(
    () =>
      Array.from(
        new Map(
          placements
            .map((placement) => getMachineCanvasAssetByCatalogId(placement.catalogId))
            .filter((visual): visual is MachinePreviewAsset => Boolean(visual))
            .map((visual) => [visual.url, visual] as const),
        ).values(),
      ),
    [placements],
  )

  useEffect(() => {
    let cancelled = false

    if (visuals.length === 0) {
      return
    }

    const nextImages: Record<string, HTMLImageElement> = {}
    let loaded = 0

    const commit = () => {
      if (!cancelled && loaded === visuals.length) {
        setImages(nextImages)
      }
    }

    visuals.forEach((visual) => {
      const cached = previewImageCache.get(visual.url)
      if (cached) {
        nextImages[visual.url] = cached
        loaded += 1
        commit()
        return
      }

      const image = new window.Image()
      image.onload = () => {
        previewImageCache.set(visual.url, image)
        nextImages[visual.url] = image
        loaded += 1
        commit()
      }
      image.onerror = () => {
        loaded += 1
        commit()
      }
      image.src = visual.url
    })

    return () => {
      cancelled = true
    }
  }, [visuals])

  return visuals.length === 0 ? {} : images
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
  placement: LayoutPlacement
  room: RoomSpec
  originX: number
  originY: number
  scale: number
}

function DimensionGuides({
  placement,
  room,
  originX,
  originY,
  scale,
}: DimensionGuidesProps) {
  const bounds = getPlacementBounds(placement)
  const distances = getNearestWallDistances(placement, room)
  const placementLeft = originX + bounds.x * scale
  const placementRight = originX + (bounds.x + bounds.width) * scale
  const placementTop = originY + bounds.y * scale
  const placementBottom = originY + (bounds.y + bounds.height) * scale
  const centerX = originX + placement.x * scale
  const centerY = originY + placement.y * scale
  const roomRight = originX + room.width * scale
  const roomBottom = originY + room.length * scale
  const horizontalStart =
    distances.nearestX.wall === 'left' ? originX : placementRight
  const horizontalEnd =
    distances.nearestX.wall === 'left' ? placementLeft : roomRight
  const verticalStart =
    distances.nearestY.wall === 'top' ? originY : placementBottom
  const verticalEnd =
    distances.nearestY.wall === 'top' ? placementTop : roomBottom

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
  return Math.round(value).toLocaleString('ru-RU')
}

function formatZoomValue(value: number) {
  return `${Math.round(value * 100)}%`
}

function clampZoom(value: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number.parseFloat(value.toFixed(2))))
}

const MIN_CANVAS_ZOOM = 0.5
const MAX_CANVAS_ZOOM = 4
const CANVAS_ZOOM_STEP = 1.2

function areProjectCanvasPropsEqual(
  previousProps: ProjectCanvasProps,
  nextProps: ProjectCanvasProps,
) {
  return (
    previousProps.title === nextProps.title &&
    previousProps.room.width === nextProps.room.width &&
    previousProps.room.length === nextProps.room.length &&
    previousProps.placements === nextProps.placements &&
    previousProps.warnings === nextProps.warnings &&
    previousProps.selectedPlacementId === nextProps.selectedPlacementId
  )
}

const MemoProjectCanvas = memo(ProjectCanvas, areProjectCanvasPropsEqual)

MemoProjectCanvas.displayName = 'ProjectCanvas'

export default MemoProjectCanvas
