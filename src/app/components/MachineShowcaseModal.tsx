import { useEffect, useMemo, useState } from 'react'
import type { MachineVisualDefinition } from '../../../shared/domain/machine-visuals.js'

interface MachineShowcaseModalProps {
  isOpen: boolean
  visuals: MachineVisualDefinition[]
  onAddToProject: (visualIds: string[]) => void
  onClose: () => void
}

function MachineShowcaseModal({
  isOpen,
  visuals,
  onAddToProject,
  onClose,
}: MachineShowcaseModalProps) {
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      setSelectedVisualIds([])
    }
  }, [isOpen])

  const selectedLookup = useMemo(
    () => new Set(selectedVisualIds),
    [selectedVisualIds],
  )

  const toggleVisual = (visualId: string) => {
    setSelectedVisualIds((currentSelected) =>
      currentSelected.includes(visualId)
        ? currentSelected.filter((currentId) => currentId !== visualId)
        : [...currentSelected, visualId],
    )
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-[32px] border border-white/12 bg-slate-950 shadow-[0_40px_120px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              DXF-Витрина
            </div>
            <h2
              className="mt-2 text-3xl font-bold text-white"
              style={{ fontFamily: '"Space Grotesk", "Manrope", sans-serif' }}
            >
              Библиотека форм станков
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Выберите несколько станков и добавьте их в проект. Пока используются
              технические имена визуалов, а не финальные инженерные названия.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
          >
            Закрыть
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="text-sm text-slate-300">
            Выбрано:{' '}
            <span className="font-semibold text-white">{selectedVisualIds.length}</span>
          </div>
          <button
            type="button"
            onClick={() => onAddToProject(selectedVisualIds)}
            disabled={selectedVisualIds.length === 0}
            className="rounded-full border border-cyan-300/50 bg-cyan-300/12 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
          >
            Добавить в проект
          </button>
        </div>

        <div className="overflow-auto px-6 py-6">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {visuals.map((visual) => {
              const isSelected = selectedLookup.has(visual.id)

              return (
                <article
                  key={visual.id}
                  className={`rounded-[26px] border p-4 transition ${
                    isSelected
                      ? 'border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]'
                      : 'border-white/10 bg-white/4'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{visual.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {visual.preview.width.toFixed(2)} x {visual.preview.height.toFixed(2)}
                      </div>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/6 px-3 py-1 text-xs text-white">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleVisual(visual.id)}
                        className="size-4 accent-cyan-300"
                      />
                      Выбрать
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleVisual(visual.id)}
                    className="block w-full text-left"
                  >
                    <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:28px_28px] bg-slate-900/70 p-4">
                      <div className="flex min-h-[220px] items-center justify-center overflow-hidden">
                        <img
                          src={visual.fullGeometry.url}
                          alt={visual.title}
                          loading="lazy"
                          decoding="async"
                          className="max-h-[180px] max-w-full object-contain"
                        />
                      </div>
                    </div>
                  </button>

                  <p className="mt-3 text-sm leading-6 text-slate-300">{visual.note}</p>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MachineShowcaseModal
