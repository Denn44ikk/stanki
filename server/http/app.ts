import express from 'express'
import cors from 'cors'
import {
  aiEditInputSchema,
  aiParseInputSchema,
  applyPatchInputSchema,
  createProjectInputSchema,
  generateLayoutInputSchema,
  projectSchema,
  updateProjectInputSchema,
} from '../../shared/domain/contracts.js'
import {
  applyPatchToProject,
  buildAiPatchFallback,
  createEmptyProject,
  generateLayoutForProject,
  materializeParseResult,
  parseRequestDeterministic,
} from '../../shared/domain/project-engine.js'
import { buildProjectDxf } from '../../shared/exporters/dxf.js'
import { buildPatchWithOpenRouter, getAiProviderStatus, parseRequestWithOpenRouter } from '../ai/openrouter.js'
import { buildProjectPdf } from '../exports/pdf.js'
import { ProjectStore } from '../persistence/project-store.js'

export function buildApp(options: { dbPath?: string } = {}) {
  const app = express()
  const store = new ProjectStore(options.dbPath)

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/system/status', (_request, response) => {
    response.json(getAiProviderStatus())
  })

  app.get('/api/projects', (_request, response) => {
    response.json(store.listProjects())
  })

  app.post('/api/projects', (request, response) => {
    const input = createProjectInputSchema.parse(request.body)
    const project = store.saveProject(
      createEmptyProject({
        title: input.title,
        mode: input.mode,
        room: input.room,
        requestText: input.requestText,
      }),
    )

    response.status(201).json(project)
  })

  app.get('/api/projects/:projectId', (request, response) => {
    const project = store.getProject(request.params.projectId)

    if (!project) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    response.json(project)
  })

  app.put('/api/projects/:projectId', (request, response) => {
    const currentProject = store.getProject(request.params.projectId)

    if (!currentProject) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const input = updateProjectInputSchema.parse(request.body)
    const project = store.saveProject(
      projectSchema.parse({
        ...currentProject,
        ...input,
      }),
    )

    response.json(project)
  })

  app.post('/api/projects/:projectId/ai/parse', async (request, response) => {
    const currentProject = store.getProject(request.params.projectId)

    if (!currentProject) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const input = aiParseInputSchema.parse(request.body)
    const aiResult = await parseRequestWithOpenRouter(input.requestText)
    const parseResult = aiResult ?? parseRequestDeterministic(input.requestText)

    const project = store.saveProject({
      ...currentProject,
      requestText: input.requestText,
      lastParseResult: parseResult,
      status: 'needs_confirmation',
      lastPendingPatch: null,
    })

    response.json({
      project,
      parseResult,
    })
  })

  app.post('/api/projects/:projectId/layout/generate', (request, response) => {
    const currentProject = store.getProject(request.params.projectId)

    if (!currentProject) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const input = generateLayoutInputSchema.parse(request.body ?? {})
    const nextTemplateId = input.templateId ?? currentProject.templateId

    const materializedItems =
      currentProject.items.length === 0 && currentProject.lastParseResult
        ? materializeParseResult(currentProject.lastParseResult)
        : currentProject.items

    if (materializedItems.length === 0) {
      response.status(400).json({ message: 'Нет подтвержденного состава для генерации схемы.' })
      return
    }

    const layoutResult = generateLayoutForProject({
      ...currentProject,
      items: materializedItems,
      templateId: nextTemplateId,
    })
    const project = store.saveProject({
      ...currentProject,
      items: materializedItems,
      templateId: nextTemplateId,
      placements: layoutResult.placements,
      warnings: layoutResult.warnings,
      status: 'layout_ready',
      lastPendingPatch: null,
    })

    response.json(project)
  })

  app.post('/api/projects/:projectId/ai/edit', async (request, response) => {
    const currentProject = store.getProject(request.params.projectId)

    if (!currentProject) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const input = aiEditInputSchema.parse(request.body)
    const patch =
      (await buildPatchWithOpenRouter(currentProject, input.instruction)) ??
      buildAiPatchFallback(currentProject, input.instruction)
    const project = store.saveProject({
      ...currentProject,
      lastPendingPatch: patch,
      status: 'patch_review',
    })

    response.json({
      project,
      patch,
    })
  })

  app.post('/api/projects/:projectId/ai/apply-patch', (request, response) => {
    const currentProject = store.getProject(request.params.projectId)

    if (!currentProject) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const input = applyPatchInputSchema.parse(request.body)
    const project = store.saveProject(applyPatchToProject(currentProject, input.patch))

    response.json(project)
  })

  app.get('/api/projects/:projectId/export/dxf', (request, response) => {
    const project = store.getProject(request.params.projectId)

    if (!project) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const dxf = buildProjectDxf({
      title: project.title,
      room: project.room,
      placements: project.placements,
    })

    response.setHeader('Content-Type', 'application/dxf; charset=utf-8')
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(project.title)}.dxf"`,
    )
    response.send(dxf)
  })

  app.get('/api/projects/:projectId/export/pdf', async (request, response) => {
    const project = store.getProject(request.params.projectId)

    if (!project) {
      response.status(404).json({ message: 'Проект не найден.' })
      return
    }

    const pdf = await buildProjectPdf(project)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(project.title)}.pdf"`,
    )
    response.send(Buffer.from(pdf))
  })

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next
    if (error instanceof Error) {
      response.status(400).json({ message: error.message })
      return
    }

    response.status(500).json({ message: 'Неожиданная ошибка сервера.' })
  })

  return app
}
