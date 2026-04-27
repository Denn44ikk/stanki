export async function requestJson<T>(input: string, init?: RequestInit) {
  let response: Response

  try {
    response = await fetch(input, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...init,
    })
  } catch {
    throw new Error(
      'Не удалось подключиться к API. Проверьте, что backend запущен и доступен на http://localhost:8787.',
    )
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(error?.message ?? 'Ошибка запроса к API.')
  }

  return (await response.json()) as T
}
