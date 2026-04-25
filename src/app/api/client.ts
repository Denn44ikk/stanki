export async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(error?.message ?? 'РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР° Рє API.')
  }

  return (await response.json()) as T
}
