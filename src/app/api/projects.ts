import type {
  AiEditInput,
  AiParseInput,
  AiPatch,
  CreateProjectInput,
  GenerateLayoutInput,
  Project,
  ProjectSummary,
  UpdateProjectInput,
} from '../../../shared/domain/contracts.js'
import { requestJson } from './client'

export async function listProjects() {
  return requestJson<ProjectSummary[]>('/api/projects')
}

export async function createProject(input: CreateProjectInput) {
  return requestJson<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getProject(projectId: string) {
  return requestJson<Project>(`/api/projects/${projectId}`)
}

export async function updateProject(projectId: string, input: UpdateProjectInput) {
  return requestJson<Project>(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function parseProjectRequest(projectId: string, input: AiParseInput) {
  return requestJson<{ project: Project; parseResult: Project['lastParseResult'] }>(
    `/api/projects/${projectId}/ai/parse`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function generateProjectLayout(
  projectId: string,
  input: GenerateLayoutInput = {},
) {
  return requestJson<Project>(`/api/projects/${projectId}/layout/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestAiPatch(projectId: string, input: AiEditInput) {
  return requestJson<{ project: Project; patch: AiPatch }>(
    `/api/projects/${projectId}/ai/edit`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function applyAiPatch(projectId: string, patch: AiPatch) {
  return requestJson<Project>(`/api/projects/${projectId}/ai/apply-patch`, {
    method: 'POST',
    body: JSON.stringify({ patch }),
  })
}

export async function downloadProjectFile(
  projectId: string,
  format: 'dxf' | 'pdf',
  title: string,
) {
  const response = await fetch(`/api/projects/${projectId}/export/${format}`)

  if (!response.ok) {
    throw new Error(`РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ ${format.toUpperCase()}.`)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeTitle = title.trim().replace(/[^\p{L}\p{N}\-_ ]/gu, '_') || 'project'

  link.href = url
  link.download = `${safeTitle}.${format}`
  link.click()
  URL.revokeObjectURL(url)
}
