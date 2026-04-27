import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { buildApp } from '../../../../server/http/app.js'
import type {
  Project,
  SystemStatus,
} from '../../../../shared/domain/contracts.js'
import { materializeParseResult } from '../../../../shared/domain/project-engine.js'

const servers = new Set<Server>()

afterEach(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  servers.clear()
})

describe('project API', () => {
  it('reports AI provider status', async () => {
    const { baseUrl } = await startTestServer()
    const status = await requestJson<SystemStatus>(`${baseUrl}/api/system/status`)

    expect(status.provider).toBe('fallback')
    expect(status.aiEnabled).toBe(false)
    expect(status.model).toBeNull()
  })

  it('creates, parses, confirms, edits and exports a project', async () => {
    const { baseUrl } = await startTestServer()

    const createdProject = await requestJson<Project>(`${baseUrl}/api/projects`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'API test',
        mode: 'ai',
      }),
    })

    expect(createdProject.mode).toBe('ai')

    const parseResponse = await requestJson<{
      project: Project
      parseResult: Project['lastParseResult']
    }>(`${baseUrl}/api/projects/${createdProject.id}/ai/parse`, {
      method: 'POST',
      body: JSON.stringify({
        requestText: 'Поставить: НБ ПБ ВР С-750 ТЦЛ ТЦП Б700 рольганги М1000',
      }),
    })

    expect(parseResponse.parseResult?.suggestedTemplateId).toBe('s750-automation')

    const confirmedProject = await requestJson<Project>(
      `${baseUrl}/api/projects/${createdProject.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: parseResponse.project.title,
          status: 'draft',
          room: parseResponse.project.room,
          requestText: parseResponse.project.requestText,
          notes: parseResponse.project.notes,
          templateId: parseResponse.parseResult?.suggestedTemplateId ?? null,
          items: materializeParseResult(parseResponse.parseResult!),
          placements: [],
          warnings: [],
          lastParseResult: parseResponse.parseResult,
          lastPendingPatch: null,
          patchHistory: [],
        }),
      },
    )

    expect(confirmedProject.items.length).toBeGreaterThan(0)

    const generatedProject = await requestJson<Project>(
      `${baseUrl}/api/projects/${createdProject.id}/layout/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          templateId: confirmedProject.templateId,
        }),
      },
    )

    expect(generatedProject.placements.length).toBeGreaterThan(0)

    const patchResponse = await requestJson<{
      project: Project
      patch: Project['lastPendingPatch']
    }>(`${baseUrl}/api/projects/${createdProject.id}/ai/edit`, {
      method: 'POST',
      body: JSON.stringify({
        instruction: 'замени Б700 на М1000',
      }),
    })

    expect(patchResponse.patch?.operations.length).toBeGreaterThan(0)

    const patchedProject = await requestJson<Project>(
      `${baseUrl}/api/projects/${createdProject.id}/ai/apply-patch`,
      {
        method: 'POST',
        body: JSON.stringify({
          patch: patchResponse.patch,
        }),
      },
    )

    expect(patchedProject.patchHistory.length).toBe(1)

    const dxf = await fetchText(
      `${baseUrl}/api/projects/${createdProject.id}/export/dxf`,
    )
    const pdf = await fetchBytes(
      `${baseUrl}/api/projects/${createdProject.id}/export/pdf`,
    )

    expect(dxf).toContain('0\nSECTION\n2\nENTITIES')
    expect(pdf[0]).toBe(0x25)
    expect(pdf[1]).toBe(0x50)
    expect(pdf[2]).toBe(0x44)
    expect(pdf[3]).toBe(0x46)
  }, 120000)
})

async function startTestServer() {
  const app = buildApp({ dbPath: ':memory:' })
  const server = app.listen(0)
  servers.add(server)
  await onceListening(server)

  const address = server.address() as AddressInfo

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

async function onceListening(server: Server) {
  if (server.listening) {
    return
  }

  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve())
  })
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as T
}

async function fetchText(url: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.text()
}

async function fetchBytes(url: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return new Uint8Array(await response.arrayBuffer())
}
