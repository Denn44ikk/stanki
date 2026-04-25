import { useState } from 'react'
import { getFootprintSize } from '../Validator'
import type {
  MachineCatalogItem,
  PlacedMachine,
  Room,
  WarningItem,
} from '../types'

interface SidebarProps {
  room: Room
  catalog: MachineCatalogItem[]
  warnings: WarningItem[]
  selectedMachine: PlacedMachine | null
  onRoomChange: (room: Room) => void
  onAddMachine: (machine: MachineCatalogItem) => void
  onRotateSelected: () => void
}

function Sidebar({
  room,
  catalog,
  warnings,
  selectedMachine,
  onRoomChange,
  onAddMachine,
  onRotateSelected,
}: SidebarProps) {
  const [widthInput, setWidthInput] = useState(String(room.width))
  const [lengthInput, setLengthInput] = useState(String(room.length))
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const handleDimensionChange = (
    axis: 'width' | 'length',
    rawValue: string,
  ) => {
    if (axis === 'width') {
      setWidthInput(rawValue)
    } else {
      setLengthInput(rawValue)
    }

    const nextWidth = parseMillimeters(axis === 'width' ? rawValue : widthInput)
    const nextLength = parseMillimeters(axis === 'length' ? rawValue : lengthInput)

    if (nextWidth && nextLength) {
      onRoomChange({ width: nextWidth, length: nextLength })
      setFormMessage(null)
      return
    }

    if (rawValue.trim().length === 0) {
      setFormMessage('Введите размеры помещения в миллиметрах.')
      return
    }

    setFormMessage('Размеры должны быть положительными целыми значениями.')
  }

  const selectedFootprint = selectedMachine
    ? getFootprintSize(
        selectedMachine.width,
        selectedMachine.length,
        selectedMachine.rotation,
      )
    : null

  return (
    <aside className="w-full border-b border-slate-200/70 bg-[linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(30,41,59,0.9))] text-slate-100 shadow-[0_30px_80px_rgba(15,23,42,0.24)] xl:w-[380px] xl:border-b-0 xl:border-r xl:border-r-slate-200/10">
      <div className="flex h-full flex-col px-4 py-5 sm:px-6 xl:px-7 xl:py-8">
        <div className="mb-7 space-y-3">
          <span className="inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-300">
            Панель управления
          </span>
          <div className="space-y-2">
            <h2
              className="text-2xl font-bold text-white"
              style={{ fontFamily: '"Space Grotesk", "Manrope", sans-serif' }}
            >
              Конфигурация участка
            </h2>
            <p className="text-sm leading-6 text-slate-300">
              MVP хранит каталог оборудования локально и сразу проверяет
              нарушения при добавлении, перемещении и повороте станков.
            </p>
          </div>
        </div>

        <section className="rounded-[26px] border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">
                Помещение
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Размеры в миллиметрах
              </p>
            </div>
            <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              Масштаб по экрану
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                Ширина
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                step="100"
                value={widthInput}
                onChange={(event) =>
                  handleDimensionChange('width', event.target.value)
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                Длина
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="1000"
                step="100"
                value={lengthInput}
                onChange={(event) =>
                  handleDimensionChange('length', event.target.value)
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
            Текущий контур: {room.width.toLocaleString('ru-RU')} x{' '}
            {room.length.toLocaleString('ru-RU')} мм
          </div>

          {formMessage ? (
            <p className="mt-3 text-sm text-amber-300">{formMessage}</p>
          ) : null}
        </section>

        <section className="mt-6 rounded-[26px] border border-white/10 bg-white/6 p-4">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">
                Каталог станков
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Кликните по карточке, чтобы добавить на план
              </p>
            </div>
            <div className="text-xs text-slate-400">{catalog.length} поз.</div>
          </div>

          <div className="grid gap-3">
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAddMachine(item)}
                className="group rounded-[24px] border border-white/8 bg-slate-950/28 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-slate-950/38 focus:outline-none focus:ring-2 focus:ring-cyan-300/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-white">
                      {item.name}
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {item.width.toLocaleString('ru-RU')} x{' '}
                      {item.length.toLocaleString('ru-RU')} мм
                    </div>
                  </div>
                  <span
                    className="mt-1 size-4 rounded-full ring-4 ring-white/8"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                  <span>Safety zone</span>
                  <span>{item.safetyZone.toLocaleString('ru-RU')} мм</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[26px] border border-white/10 bg-white/6 p-4">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">
                Выбранный станок
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Двойной клик по станку на плане тоже выполняет поворот
              </p>
            </div>
          </div>

          {selectedMachine && selectedFootprint ? (
            <div className="space-y-4">
              <div className="rounded-[24px] bg-slate-950/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {selectedMachine.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      ID: {selectedMachine.machineId}
                    </div>
                  </div>
                  <span
                    className="mt-1 size-4 rounded-full ring-4 ring-white/8"
                    style={{ backgroundColor: selectedMachine.color }}
                  />
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-2">
                  <InfoCard
                    label="Габариты"
                    value={`${selectedFootprint.width.toLocaleString('ru-RU')} x ${selectedFootprint.height.toLocaleString('ru-RU')} мм`}
                  />
                  <InfoCard
                    label="Поворот"
                    value={`${selectedMachine.rotation}°`}
                  />
                  <InfoCard
                    label="Центр X/Y"
                    value={`${Math.round(selectedMachine.x).toLocaleString('ru-RU')} / ${Math.round(selectedMachine.y).toLocaleString('ru-RU')} мм`}
                  />
                  <InfoCard
                    label="Safety zone"
                    value={`${selectedMachine.safetyZone.toLocaleString('ru-RU')} мм`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={onRotateSelected}
                className="w-full rounded-[22px] bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
              >
                Повернуть на 90°
              </button>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/14 bg-slate-950/20 px-4 py-8 text-center text-sm leading-6 text-slate-400">
              Выберите станок на плане, чтобы увидеть габариты, координаты и
              быстро повернуть его.
            </div>
          )}
        </section>

        <section className="mt-6 flex-1 rounded-[26px] border border-white/10 bg-white/6 p-4">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">
                Предупреждения
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Проверка выполняется автоматически
              </p>
            </div>
            <div className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">
              {warnings.length}
            </div>
          </div>

          <div className="grid gap-3">
            {warnings.length > 0 ? (
              warnings.map((warning) => (
                <div
                  key={warning.id}
                  className={`rounded-[22px] px-4 py-3 text-sm leading-6 ${
                    warning.tone === 'critical'
                      ? 'bg-rose-500/14 text-rose-100'
                      : 'bg-amber-500/14 text-amber-100'
                  }`}
                >
                  {warning.message}
                </div>
              ))
            ) : (
              <div className="rounded-[22px] bg-emerald-500/12 px-4 py-3 text-sm leading-6 text-emerald-200">
                Конфликтов не найдено. Помещение и safety zone соответствуют
                текущей схеме.
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}

interface InfoCardProps {
  label: string
  value: string
}

function InfoCard({ label, value }: InfoCardProps) {
  return (
    <div className="rounded-[20px] bg-white/6 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  )
}

function parseMillimeters(value: string) {
  if (!value.trim()) {
    return null
  }

  const normalized = value.replaceAll(',', '').trim()
  const parsed = Number.parseInt(normalized, 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export default Sidebar
