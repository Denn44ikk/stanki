import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../../../../../src/app/api/client.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('requestJson', () => {
  it('returns parsed json for successful responses', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    ) as typeof fetch

    await expect(requestJson<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true })
  })

  it('throws a friendly message when API is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch

    await expect(requestJson('/api/test')).rejects.toThrow(
      'Не удалось подключиться к API. Проверьте, что backend запущен и доступен на http://localhost:8787.',
    )
  })

  it('throws the API error message for non-ok responses', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'Проект не найден.' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    ) as typeof fetch

    await expect(requestJson('/api/test')).rejects.toThrow('Проект не найден.')
  })
})
