import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  applyAiPatch,
  createProject,
  downloadProjectFile,
  generateProjectLayout,
  getProject,
  listProjects,
  parseProjectRequest,
  requestAiPatch,
  updateProject,
} from './api/projects'
import { getSystemStatus } from './api/system'
import {
  getPreferredCatalogIdByVisualId,
  getMachineShowcaseVisuals,
  getMachinePreviewByCatalogId,
} from '../../shared/domain/machine-visuals.js'
import {
  DEFAULT_ROOM,
  TEMPLATES,
  getCatalogItem,
  getTemplate,
} from '../../shared/domain/catalog.js'
import {
  computePlacementWarnings,
  generateLayoutForProject,
  materializeParseResult,
} from '../../shared/domain/project-engine.js'
import type {
  AiPatch,
  CreateProjectInput,
  LayoutPlacement,
  Project,
  ProjectItem,
  ProjectMode,
  ProjectSummary,
  SystemStatus,
  UpdateProjectInput,
} from '../../shared/domain/contracts.js'

const LazyMachineShowcaseModal = lazy(() => import('./components/MachineShowcaseModal'))
const LazyProjectCanvas = lazy(() => import('./components/ProjectCanvas'))

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isShowcaseOpen, setIsShowcaseOpen] = useState(false)
  const [showcaseSession, setShowcaseSession] = useState(0)
  const [createTitle, setCreateTitle] = useState('Новый проект линии')
  const [createMode, setCreateMode] = useState<ProjectMode>('manual')
  const [aiInstruction, setAiInstruction] = useState('')

  const selectedPlacement = useMemo(
    () =>
      project?.placements.find((placement) => placement.id === selectedPlacementId) ??
      null,
    [project, selectedPlacementId],
  )
  const showcaseVisuals = useMemo(() => getMachineShowcaseVisuals(), [])

  const openShowcase = () => {
    setShowcaseSession((currentSession) => currentSession + 1)
    setIsShowcaseOpen(true)
  }

  const closeShowcase = () => {
    setIsShowcaseOpen(false)
  }

  const loadProjects = async () => {
    const nextProjects = await listProjects()
    setProjects(nextProjects)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const nextProjects = await listProjects()

        if (cancelled) {
          return
        }

        setProjects(nextProjects)

        if (nextProjects.length === 0) {
          return
        }

        const firstProject = await getProject(nextProjects[0].id)

        if (cancelled) {
          return
        }

        setProject(firstProject)
      } catch (error) {
        if (cancelled) {
          return
        }

        setNotice(getErrorMessage(error))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const nextStatus = await getSystemStatus()

        if (!cancelled) {
          setSystemStatus(nextStatus)
        }
      } catch {
        if (!cancelled) {
          setSystemStatus(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const openProject = async (projectId: string) => {
    setBusyKey('open-project')
    setNotice(null)

    try {
      const nextProject = await getProject(projectId)
      setProject(nextProject)
      setSelectedPlacementId(null)
      setAiInstruction('')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleCreateProject = async () => {
    setBusyKey('create-project')
    setNotice(null)

    try {
      const input: CreateProjectInput = {
        title: createTitle.trim(),
        mode: createMode,
        room: DEFAULT_ROOM,
        requestText: '',
      }
      const nextProject = await createProject(input)

      setProject(nextProject)
      setSelectedPlacementId(null)
      setAiInstruction('')
      await loadProjects()
      setNotice('Проект создан.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const persistProject = async (nextProject: Project, message = 'Проект сохранён.') => {
    setBusyKey('save-project')
    setNotice(null)

    try {
      const savedProject = await updateProject(nextProject.id, toUpdateProjectInput(nextProject))
      setProject(savedProject)
      await loadProjects()
      setNotice(message)
      return savedProject
    } catch (error) {
      setNotice(getErrorMessage(error))
      return null
    } finally {
      setBusyKey(null)
    }
  }

  const generateLayout = async () => {
    if (!project) {
      return
    }

    setBusyKey('generate-layout')
    setNotice(null)

    try {
      const savedProject = await updateProject(
        project.id,
        toUpdateProjectInput({
          ...project,
          placements: [],
          warnings: [],
          lastPendingPatch: null,
        }),
      )
      const generatedProject = await generateProjectLayout(savedProject.id, {
        templateId: savedProject.templateId,
      })

      setProject(generatedProject)
      setSelectedPlacementId(null)
      await loadProjects()
      setNotice('Схема построена.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleParseRequest = async () => {
    if (!project) {
      return
    }

    setBusyKey('parse-request')
    setNotice(null)

    try {
      const response = await parseProjectRequest(project.id, {
        requestText: project.requestText.trim(),
      })
      setProject(response.project)
      setSelectedPlacementId(null)
      await loadProjects()
      setNotice('Текст менеджера разобран. Проверьте состав и подтвердите его.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleConfirmParse = async () => {
    if (!project?.lastParseResult) {
      return
    }

    setBusyKey('confirm-parse')
    setNotice(null)

    try {
      const draftProject: Project = {
        ...project,
        items: materializeParseResult(project.lastParseResult),
        templateId: project.lastParseResult.suggestedTemplateId ?? project.templateId,
        placements: [],
        warnings: [],
        status: 'draft',
        lastPendingPatch: null,
      }
      const savedProject = await updateProject(
        draftProject.id,
        toUpdateProjectInput(draftProject),
      )
      const generatedProject = await generateProjectLayout(savedProject.id, {
        templateId: savedProject.templateId,
      })

      setProject(generatedProject)
      setSelectedPlacementId(null)
      await loadProjects()
      setNotice('Состав подтверждён и схема построена.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleRequestAiPatch = async () => {
    if (!project || !aiInstruction.trim()) {
      return
    }

    setBusyKey('request-ai-patch')
    setNotice(null)

    try {
      const savedProject = await updateProject(project.id, toUpdateProjectInput(project))
      const response = await requestAiPatch(savedProject.id, {
        instruction: aiInstruction.trim(),
      })

      setProject(response.project)
      setNotice('AI-патч подготовлен. Проверьте diff и подтвердите применение.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleApplyPatch = async (patch: AiPatch) => {
    if (!project) {
      return
    }

    setBusyKey('apply-ai-patch')
    setNotice(null)

    try {
      const nextProject = await applyAiPatch(project.id, patch)
      setProject(nextProject)
      setSelectedPlacementId(null)
      setAiInstruction('')
      await loadProjects()
      setNotice('AI-патч применён.')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleAddShowcaseVisuals = (visualIds: string[]) => {
    if (visualIds.length === 0) {
      setNotice('Выберите хотя бы один станок в витрине.')
      return
    }

    const catalogIds = visualIds
      .map((visualId) => getPreferredCatalogIdByVisualId(visualId))
      .filter((catalogId): catalogId is string => Boolean(catalogId))

    if (catalogIds.length === 0) {
      setNotice('Для выбранных визуалов пока нет сопоставления с проектными объектами.')
      return
    }

    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject
      }

      const draftProject: Project = {
        ...currentProject,
        items: [
          ...currentProject.items,
          ...catalogIds.map((catalogId) => createProjectItem(catalogId)),
        ],
        lastPendingPatch: null,
      }
      const layoutResult = generateLayoutForProject(draftProject)

      return {
        ...draftProject,
        placements: layoutResult.placements,
        warnings: layoutResult.warnings,
        status: 'draft',
      }
    })

    setSelectedPlacementId(null)
    closeShowcase()
    setNotice(`Добавлено в проект и расставлено: ${catalogIds.length}`)
  }

  const handleRemoveItem = (projectItemId: string) => {
    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject
      }

      const draftProject: Project = {
        ...currentProject,
        items: currentProject.items.filter((item) => item.id !== projectItemId),
        placements: currentProject.placements.filter(
          (placement) => placement.projectItemId !== projectItemId,
        ),
        lastPendingPatch: null,
      }
      const layoutResult = generateLayoutForProject(draftProject)

      return {
        ...draftProject,
        placements: layoutResult.placements,
        warnings: layoutResult.warnings,
        status: 'draft',
      }
    })
    setSelectedPlacementId(null)
  }

  const handleRotateSelected = () => {
    if (!project || !selectedPlacement) {
      return
    }

    updatePlacement(selectedPlacement.id, (placement) => ({
      ...placement,
      rotation: placement.rotation === 0 ? 90 : 0,
      manuallyAdjusted: true,
    }))
  }

  const handleMovePlacement = (placementId: string, x: number, y: number) => {
    updatePlacement(placementId, (placement) => ({
        ...placement,
        x,
      y,
      manuallyAdjusted: true,
    }))
  }

  const handleParseItemChange = (
    index: number,
    field: 'catalogId' | 'quantity',
    value: string,
  ) => {
    setProject((currentProject) => {
      if (!currentProject?.lastParseResult) {
        return currentProject
      }

      const extractedItems = currentProject.lastParseResult.extractedItems.map(
        (item, itemIndex) => {
          if (itemIndex !== index) {
            return item
          }

          if (field === 'catalogId') {
            const catalog = getCatalogItem(value)
            return {
              ...item,
              catalogId: value,
              alternativeCatalogIds: catalog?.analogs ?? item.alternativeCatalogIds,
            }
          }

          return {
            ...item,
            quantity: Math.max(1, Number.parseInt(value, 10) || 1),
          }
        },
      )

      return {
        ...currentProject,
        lastParseResult: {
          ...currentProject.lastParseResult,
          extractedItems,
        },
      }
    })
  }

  const exportCurrentProjectFile = async (format: 'dxf' | 'pdf') => {
    if (!project) {
      return
    }

    setBusyKey(`export-${format}`)
    setNotice(null)

    try {
      const savedProject = await updateProject(project.id, toUpdateProjectInput(project))
      setProject(savedProject)
      await loadProjects()
      await downloadProjectFile(savedProject.id, format, savedProject.title)
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemoveParsedItem = (index: number) => {
    setProject((currentProject) => {
      if (!currentProject?.lastParseResult) {
        return currentProject
      }

      return {
        ...currentProject,
        lastParseResult: {
          ...currentProject.lastParseResult,
          extractedItems: currentProject.lastParseResult.extractedItems.filter(
            (_item, itemIndex) => itemIndex !== index,
          ),
        },
      }
    })
  }

  const handleRoomChange = (axis: 'width' | 'length', value: string) => {
    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject
      }

      const parsed = Number.parseInt(value, 10)

      if (!Number.isFinite(parsed) || parsed <= 0) {
        return currentProject
      }

      const nextProject = {
        ...currentProject,
        room: {
          ...currentProject.room,
          [axis]: parsed,
        },
      }

      nextProject.warnings = computePlacementWarnings(
        nextProject.room,
        nextProject.placements,
      )

      return nextProject
    })
  }

  const updatePlacement = (
    placementId: string,
    updater: (placement: LayoutPlacement) => LayoutPlacement,
  ) => {
    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject
      }

      const placements = currentProject.placements.map((placement) =>
        placement.id === placementId ? updater(placement) : placement,
      )

      return {
        ...currentProject,
        placements,
        warnings: computePlacementWarnings(currentProject.room, placements),
      }
    })
  }

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.08),_transparent_42%),linear-gradient(135deg,_#f4efe4_0%,_#f8f5ee_40%,_#efe7d6_100%)] text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-[1820px] min-w-0 flex-col gap-4 px-4 py-4 xl:flex-row xl:px-6 xl:py-6">
        <aside className="w-full rounded-[32px] border border-slate-200/70 bg-[linear-gradient(180deg,_rgba(15,23,42,0.94),_rgba(30,41,59,0.92))] p-4 text-slate-100 shadow-[0_30px_80px_rgba(15,23,42,0.24)] xl:w-[330px] xl:shrink-0">
          <div className="mb-5 space-y-2">
            <span className="inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-300">
              AI-First Layout
            </span>
            <h1
              className="text-2xl font-bold text-white"
              style={{ fontFamily: '"Space Grotesk", "Manrope", sans-serif' }}
            >
              Конструктор схем линии
            </h1>
            <p className="text-sm leading-6 text-slate-300">
              Текст менеджера, ручной состав, AI-правки и инженерный экспорт в
              одном проекте.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={openShowcase}
                className="rounded-full border border-cyan-300/40 bg-cyan-300/12 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20"
              >
                Открыть DXF-витрину станков
              </button>
            </div>
          </div>
            <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-3 text-xs text-slate-300">
              <div className="uppercase tracking-[0.18em] text-slate-400">Статус AI</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {systemStatus
                  ? systemStatus.aiEnabled
                    ? `OpenRouter${systemStatus.model ? ` • ${systemStatus.model}` : ''}`
                    : 'Только fallback-правила'
                  : 'Статус недоступен'}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-400">
                {systemStatus?.aiEnabled
                  ? 'Реальный AI включён: доступны AI-parse и AI-edit сценарии.'
                  : 'Если OPENROUTER_API_KEY не задан, используется детерминированный fallback по каталогу и алиасам.'}
              </div>
            </div>
          {notice ? (
            <div className="mt-4 rounded-[22px] border border-amber-200/40 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-[0_10px_30px_rgba(120,53,15,0.14)]">
              {notice}
            </div>
          ) : null}
          <section className="rounded-[26px] border border-white/10 bg-white/6 p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
                Новый проект
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Создайте ручной или AI-сценарий, потом выберите его из списка.
              </p>
            </div>

            <div className="space-y-3">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Название
                </span>
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-white outline-none focus:border-cyan-300"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Режим
                </span>
                <select
                  value={createMode}
                  onChange={(event) => setCreateMode(event.target.value as ProjectMode)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-white outline-none focus:border-cyan-300"
                >
                  <option value="manual">Ручной</option>
                  <option value="ai">AI</option>
                </select>
              </label>

              <button
                type="button"
                onClick={handleCreateProject}
                disabled={busyKey === 'create-project'}
                className="w-full rounded-[22px] bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {busyKey === 'create-project' ? 'Создаём...' : 'Создать проект'}
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-[26px] border border-white/10 bg-white/6 p-4">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
                  Проекты
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Сохранённые макеты и AI-разборы.
                </p>
              </div>
              <div className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">
                {projects.length}
              </div>
            </div>

            <div className="grid gap-3">
              {projects.map((summary) => (
                <button
                  key={summary.id}
                  type="button"
                  onClick={() => void openProject(summary.id)}
                  className={`rounded-[24px] border px-4 py-4 text-left transition ${
                    project?.id === summary.id
                      ? 'border-cyan-300/60 bg-cyan-300/10'
                      : 'border-white/8 bg-slate-950/28 hover:border-cyan-300/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {summary.title}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {summary.mode === 'ai' ? 'AI' : 'MANUAL'} • {summary.status}
                      </div>
                    </div>
                    <div className="rounded-full bg-white/8 px-3 py-1 text-[11px] text-slate-300">
                      {summary.itemCount} поз.
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Обновлён: {new Date(summary.updatedAt).toLocaleString('ru-RU')}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        {project ? (
          <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row">
            <section className="w-full rounded-[32px] border border-white/70 bg-white/75 p-4 shadow-[0_35px_110px_rgba(15,23,42,0.12)] backdrop-blur xl:w-[430px] xl:shrink-0">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-amber-900">
                    {project.mode === 'ai' ? 'AI Project' : 'Manual Project'}
                  </div>
                  <div>
                    <h2
                      className="text-2xl font-bold text-slate-950"
                      style={{ fontFamily: '"Space Grotesk", "Manrope", sans-serif' }}
                    >
                      {project.title}
                    </h2>
                    <p className="text-sm text-slate-600">
                      Статус: {project.status} • позиций: {project.items.length} •
                      размещений: {project.placements.length}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void persistProject(project)}
                    disabled={busyKey === 'save-project'}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400 hover:text-cyan-700"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateLayout()}
                    disabled={busyKey === 'generate-layout'}
                    className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                  >
                    Построить схему
                  </button>
                </div>
              </header>

              <div className="space-y-5 overflow-y-auto pr-1 xl:max-h-[calc(100vh-7rem)]">
                <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                    Параметры проекта
                  </h3>
                  <div className="mt-4 grid gap-3">
                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Название
                      </span>
                      <input
                        value={project.title}
                        onChange={(event) =>
                          setProject((currentProject) =>
                            currentProject
                              ? { ...currentProject, title: event.target.value }
                              : currentProject,
                          )
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Ширина цеха
                        </span>
                        <input
                          type="number"
                          value={project.room.width}
                          onChange={(event) => handleRoomChange('width', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Длина цеха
                        </span>
                        <input
                          type="number"
                          value={project.room.length}
                          onChange={(event) => handleRoomChange('length', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                        />
                      </label>
                    </div>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Шаблон
                      </span>
                      <select
                        value={project.templateId ?? ''}
                        onChange={(event) =>
                          setProject((currentProject) =>
                            currentProject
                            ? ({
                                  ...currentProject,
                                  templateId: event.target.value || null,
                                  placements: [],
                                  warnings: [],
                                  status: 'draft',
                                } satisfies Project)
                              : currentProject,
                          )
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                      >
                        <option value="">Без шаблона</option>
                        {TEMPLATES.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Заметки
                      </span>
                      <textarea
                        value={project.notes}
                        onChange={(event) =>
                          setProject((currentProject) =>
                            currentProject
                              ? { ...currentProject, notes: event.target.value }
                              : currentProject,
                          )
                        }
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                      />
                    </label>
                  </div>
                </section>

                {project.mode === 'ai' ? (
                  <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                          Текст менеджера
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          AI разберёт текст, предложит состав и шаблон, а вы
                          подтвердите его перед построением схемы.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleParseRequest()}
                        disabled={busyKey === 'parse-request' || !project.requestText.trim()}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        Разобрать AI
                      </button>
                    </div>
                    <textarea
                      value={project.requestText}
                      onChange={(event) =>
                        setProject((currentProject) =>
                          currentProject
                            ? { ...currentProject, requestText: event.target.value }
                            : currentProject,
                        )
                      }
                      rows={7}
                      className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                      placeholder="Вставьте задание менеджера..."
                    />

                    {project.lastParseResult ? (
                      <div className="mt-4 space-y-3 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-amber-950">
                              Подтверждение состава
                            </div>
                            <div className="text-xs text-amber-800">
                              AI предложил шаблон:{' '}
                              {getTemplate(project.lastParseResult.suggestedTemplateId)?.name ??
                                'не выбран'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleConfirmParse()}
                            className="rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
                          >
                            Подтвердить и построить
                          </button>
                        </div>

                        <div className="grid gap-3">
                          {project.lastParseResult.extractedItems.map((item, index) => (
                            <div
                              key={`${item.catalogId}-${index}`}
                              className="rounded-[20px] border border-amber-200 bg-white px-3 py-3"
                            >
                              <div className="grid gap-3 sm:grid-cols-[1fr_92px_auto]">
                                <select
                                  value={item.catalogId}
                                  onChange={(event) =>
                                    handleParseItemChange(
                                      index,
                                      'catalogId',
                                      event.target.value,
                                    )
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-400"
                                >
                                  {Array.from(
                                    new Set([
                                      item.catalogId,
                                      ...item.alternativeCatalogIds,
                                    ]),
                                  ).map((catalogId) => (
                                    <option key={catalogId} value={catalogId}>
                                      {getCatalogItem(catalogId)?.name ?? catalogId}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(event) =>
                                    handleParseItemChange(
                                      index,
                                      'quantity',
                                      event.target.value,
                                    )
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveParsedItem(index)}
                                  className="rounded-2xl border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                                >
                                  Удалить
                                </button>
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                Источник: {item.sourceText} • confidence:{' '}
                                {(item.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>

                        {project.lastParseResult.unresolvedTokens.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {project.lastParseResult.unresolvedTokens.map((token) => (
                              <span
                                key={token}
                                className="rounded-full bg-white px-3 py-1 text-xs text-slate-700"
                              >
                                {token}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                        Состав линии
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Добавляйте позиции вручную или работайте с подтверждённым
                        AI-составом.
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700">
                      {project.items.length}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {project.items.map((item) => {
                      const catalog = getCatalogItem(item.catalogId)
                      return (
                        <div
                          key={item.id}
                          className="rounded-[20px] border border-slate-200 bg-white px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {catalog?.name ?? item.catalogId}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {catalog?.code ?? item.catalogId} • {item.chosenBy}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 rounded-[20px] border border-dashed border-cyan-200 bg-cyan-50/70 px-4 py-4 text-sm text-cyan-950">
                    Станки добавляются через кнопку <span className="font-semibold">«Открыть DXF-витрину станков»</span>.
                    Старый прямой каталог на этой панели отключён, чтобы не дублировать сценарий и не путать проектный поток.
                  </div>
                </section>

                {selectedPlacement ? (
                  <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                      Выбранный элемент
                    </h3>
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-4">
                        <CatalogVisualPreview catalogId={selectedPlacement.catalogId} size="large" />
                        <div className="min-w-0 flex-1">
                          <div className="text-lg font-semibold text-slate-900">
                            {selectedPlacement.label}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            X/Y: {Math.round(selectedPlacement.x).toLocaleString('ru-RU')} /{' '}
                            {Math.round(selectedPlacement.y).toLocaleString('ru-RU')} мм
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Размер: {selectedPlacement.width.toLocaleString('ru-RU')} x{' '}
                            {selectedPlacement.length.toLocaleString('ru-RU')} мм
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Поворот: {selectedPlacement.rotation}°
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={handleRotateSelected}
                        className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                      >
                        Повернуть
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(selectedPlacement.projectItemId)}
                        className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Удалить из проекта
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                        AI-правки
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Попросите AI заменить, удалить, добавить или повернуть
                        оборудование. Патч не применяется без подтверждения.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRequestAiPatch()}
                      disabled={busyKey === 'request-ai-patch' || !aiInstruction.trim()}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      Спросить AI
                    </button>
                  </div>

                  <textarea
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                    rows={4}
                    className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-400"
                    placeholder="Например: замени Б700 на М1000 и убери рольганги"
                  />

                  {project.lastPendingPatch ? (
                    <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-cyan-950">
                            Preview патча
                          </div>
                          <div className="text-xs text-cyan-800">
                            {project.lastPendingPatch.explanation}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleApplyPatch(project.lastPendingPatch as AiPatch)}
                          className="rounded-full bg-cyan-900 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
                        >
                          Применить
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {project.lastPendingPatch.operations.map((operation, index) => (
                          <div
                            key={`${operation.type}-${index}`}
                            className="rounded-[18px] border border-cyan-200 bg-white px-3 py-3 text-sm text-slate-700"
                          >
                            {describePatchOperation(operation, project.items)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[26px] border border-slate-200/70 bg-slate-50/90 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
                        Предупреждения
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Проверяются пересечения зон безопасности и выход за
                        границы цеха.
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700">
                      {project.warnings.length}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {project.warnings.length > 0 ? (
                      project.warnings.map((warning) => (
                        <div
                          key={warning}
                          className="rounded-[18px] bg-amber-100 px-4 py-3 text-sm text-amber-950"
                        >
                          {warning}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] bg-emerald-100 px-4 py-3 text-sm text-emerald-950">
                        Конфликтов нет. Схема готова к сохранению или экспорту.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </section>

            <Suspense fallback={<ProjectCanvasFallback title={project.title} />}>
              <LazyProjectCanvas
                title={project.title}
                room={project.room}
                placements={project.placements}
                warnings={project.warnings}
                selectedPlacementId={selectedPlacementId}
                onSelect={setSelectedPlacementId}
                onMove={handleMovePlacement}
                onRotate={(placementId) => {
                  setSelectedPlacementId(placementId)
                  updatePlacement(placementId, (placement) => ({
                    ...placement,
                    rotation: placement.rotation === 0 ? 90 : 0,
                    manuallyAdjusted: true,
                  }))
                }}
                onExportDxf={() => {
                  if (project) {
                    void exportCurrentProjectFile('dxf')
                  }
                }}
                onExportPdf={() => {
                  if (project) {
                    void exportCurrentProjectFile('pdf')
                  }
                }}
              />
            </Suspense>
          </div>
        ) : (
          <main className="flex flex-1 items-center justify-center rounded-[34px] border border-white/70 bg-white/75 p-8 text-center shadow-[0_35px_110px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="max-w-xl space-y-4">
              <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-amber-900">
                Start Here
              </div>
              <h2
                className="text-4xl font-bold text-slate-950"
                style={{ fontFamily: '"Space Grotesk", "Manrope", sans-serif' }}
              >
                Создайте проект и начните собирать линию
              </h2>
              <p className="text-base leading-7 text-slate-600">
                Ручной режим подходит для прямой сборки состава. AI-режим
                повторяет логику менеджера: разбирает текст, предлагает
                шаблон, ждёт подтверждения и только потом строит схему.
              </p>
            </div>
          </main>
        )}
        </div>
      </div>

      {isShowcaseOpen ? (
        <Suspense fallback={<MachineShowcaseModalFallback onClose={closeShowcase} />}>
          <LazyMachineShowcaseModal
            key={showcaseSession}
            isOpen={isShowcaseOpen}
            visuals={showcaseVisuals}
            onAddToProject={handleAddShowcaseVisuals}
            onClose={closeShowcase}
          />
        </Suspense>
      ) : null}
    </>
  )
}

interface ProjectCanvasFallbackProps {
  title: string
}

function ProjectCanvasFallback({ title }: ProjectCanvasFallbackProps) {
  return (
    <section className="flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/75 shadow-[0_35px_110px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          Схема проекта
        </div>
        <div className="mt-1 text-sm text-slate-600">{title}</div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.08),_transparent_38%),linear-gradient(180deg,_rgba(241,245,249,0.95),_rgba(226,232,240,0.96))]">
        <div className="rounded-full border border-slate-200 bg-white/90 px-5 py-3 text-sm font-medium text-slate-600 shadow">
          Загружаем окно помещения...
        </div>
      </div>
    </section>
  )
}

interface MachineShowcaseModalFallbackProps {
  onClose: () => void
}

function MachineShowcaseModalFallback({ onClose }: MachineShowcaseModalFallbackProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col gap-5 rounded-[32px] border border-white/12 bg-slate-950 p-6 shadow-[0_40px_120px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              DXF-Витрина
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              Загружаем библиотеку станков...
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
          >
            Закрыть
          </button>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/4 px-5 py-6 text-sm text-slate-300">
          Подгружаем витрину отдельно, чтобы основной экран открывался быстрее.
        </div>
      </div>
    </div>
  )
}

function toUpdateProjectInput(project: Project): UpdateProjectInput {
  return {
    title: project.title,
    status: project.status,
    room: project.room,
    requestText: project.requestText,
    notes: project.notes,
    templateId: project.templateId,
    items: project.items,
    placements: project.placements,
    warnings: project.warnings,
    lastParseResult: project.lastParseResult,
    lastPendingPatch: project.lastPendingPatch,
    patchHistory: project.patchHistory,
  }
}

function describePatchOperation(operation: AiPatch['operations'][number], items: ProjectItem[]) {
  switch (operation.type) {
    case 'add':
      return `Добавить ${getCatalogItem(operation.catalogId)?.name ?? operation.catalogId}`
    case 'remove':
      return `Удалить ${findProjectItemLabel(operation.targetProjectItemId, items)}`
    case 'replace':
      return `Заменить ${findProjectItemLabel(operation.targetProjectItemId, items)} на ${
        getCatalogItem(operation.nextCatalogId)?.name ?? operation.nextCatalogId
      }`
    case 'move':
      return `Переместить placement ${operation.targetPlacementId} в (${Math.round(operation.x)}, ${Math.round(operation.y)})`
    case 'rotate':
      return `Повернуть placement ${operation.targetPlacementId} на ${operation.rotation}°`
  }
}

function findProjectItemLabel(projectItemId: string, items: ProjectItem[]) {
  const item = items.find((candidate) => candidate.id === projectItemId)
  return getCatalogItem(item?.catalogId ?? '')?.name ?? projectItemId
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Неожиданная ошибка.'
}

function createProjectItem(catalogId: string): ProjectItem {
  return {
    id: crypto.randomUUID(),
    catalogId,
    quantity: 1,
    sourceText: getCatalogItem(catalogId)?.code ?? catalogId,
    chosenBy: 'manual',
    replacementReason: null,
    unresolvedFlag: false,
  }
}

interface CatalogVisualPreviewProps {
  catalogId: string
  size?: 'small' | 'large'
}

function CatalogVisualPreview({
  catalogId,
  size = 'small',
}: CatalogVisualPreviewProps) {
  const preview = getMachinePreviewByCatalogId(catalogId)
  const sizeClasses =
    size === 'large'
      ? 'h-24 w-32 rounded-[18px] p-3'
      : 'h-[72px] w-24 rounded-[16px] p-2'

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-[linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:18px_18px] ${sizeClasses}`}
    >
      {preview ? (
        <img
          src={preview.url}
          alt={catalogId}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {catalogId}
        </div>
      )}
    </div>
  )
}

export default App
