import {
  aiParseResultSchema,
  aiPatchSchema,
  type AiParseResult,
  type AiPatch,
  type Project,
  type SystemStatus,
} from '../../shared/domain/contracts.js'
import {
  AI_FEW_SHOTS,
  CATALOG,
  TEMPLATES,
  getCatalogItem,
  getTemplate,
} from '../../shared/domain/catalog.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function getAiProviderStatus(): SystemStatus {
  const aiEnabled = Boolean(process.env.OPENROUTER_API_KEY)

  return {
    aiEnabled,
    provider: aiEnabled ? 'openrouter' : 'fallback',
    model: aiEnabled ? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini' : null,
  }
}

export async function parseRequestWithOpenRouter(
  requestText: string,
): Promise<AiParseResult | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null
  }

  const content = await sendPrompt([
    {
      role: 'system',
      content: [
        'Ты помощник менеджера по лесопильным линиям.',
        'Верни только JSON без markdown.',
        'Нужно распознать оборудование, подсказать шаблон и дать список нераспознанных токенов.',
        'Используй только catalogId и templateId из переданного каталога.',
        `Каталог: ${JSON.stringify(
          CATALOG.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            aliases: item.aliases,
            analogs: item.analogs,
          })),
        )}`,
        `Шаблоны: ${JSON.stringify(
          TEMPLATES.map((template) => ({
            id: template.id,
            name: template.name,
            sequence: template.sequence,
          })),
        )}`,
        `Примеры: ${JSON.stringify(AI_FEW_SHOTS)}`,
        'Формат ответа: {"extractedItems":[{"catalogId":"...","quantity":1,"sourceText":"...","chosenBy":"ai","replacementReason":null,"unresolvedFlag":false,"confidence":0.9,"alternativeCatalogIds":["..."]}],"unresolvedTokens":["..."],"suggestedTemplateId":"...","warnings":["..."],"explanation":"..."}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: requestText,
    },
  ])

  if (!content) {
    return null
  }

  const json = extractJson(content)

  if (!json) {
    return null
  }

  const parsed = aiParseResultSchema.safeParse(json)

  if (!parsed.success) {
    return null
  }

  return sanitizeParseResult(parsed.data)
}

export async function buildPatchWithOpenRouter(
  project: Project,
  instruction: string,
): Promise<AiPatch | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null
  }

  const content = await sendPrompt([
    {
      role: 'system',
      content: [
        'Ты помощник по правке производственной схемы.',
        'Верни только JSON без markdown.',
        'Строй только структурированный патч, не применяй его.',
        'Используй существующие targetProjectItemId и targetPlacementId.',
        'Доступные операции: add, remove, replace, move, rotate.',
        `Каталог: ${JSON.stringify(
          CATALOG.map((item) => ({
            id: item.id,
            code: item.code,
            aliases: item.aliases,
          })),
        )}`,
        `Проект: ${JSON.stringify({
          id: project.id,
          items: project.items.map((item) => ({
            id: item.id,
            catalogId: item.catalogId,
            label: getCatalogItem(item.catalogId)?.code ?? item.catalogId,
          })),
          placements: project.placements.map((placement) => ({
            id: placement.id,
            catalogId: placement.catalogId,
            label: placement.label,
            x: placement.x,
            y: placement.y,
            rotation: placement.rotation,
          })),
          templateId: project.templateId,
          templateName: getTemplate(project.templateId)?.name ?? null,
        })}`,
        'Формат ответа: {"prompt":"...","operations":[...],"warnings":["..."],"explanation":"..."}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: instruction,
    },
  ])

  if (!content) {
    return null
  }

  const json = extractJson(content)

  if (!json) {
    return null
  }

  const parsed = aiPatchSchema.safeParse(json)

  if (!parsed.success) {
    return null
  }

  return sanitizePatch(parsed.data)
}

async function sendPrompt(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER ?? 'http://localhost:5173',
      'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'stanki',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
      temperature: 0.1,
      messages,
    }),
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  return payload.choices?.[0]?.message?.content ?? null
}

function extractJson(value: string) {
  const firstBrace = value.indexOf('{')
  const lastBrace = value.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }

  try {
    return JSON.parse(value.slice(firstBrace, lastBrace + 1))
  } catch {
    return null
  }
}

function sanitizeParseResult(result: AiParseResult): AiParseResult {
  return {
    ...result,
    extractedItems: result.extractedItems
      .filter((item) => getCatalogItem(item.catalogId))
      .map((item) => ({
        ...item,
        chosenBy: 'ai',
        alternativeCatalogIds: item.alternativeCatalogIds.filter((catalogId) =>
          Boolean(getCatalogItem(catalogId)),
        ),
      })),
    suggestedTemplateId:
      result.suggestedTemplateId &&
      TEMPLATES.some((template) => template.id === result.suggestedTemplateId)
        ? result.suggestedTemplateId
        : null,
  }
}

function sanitizePatch(patch: AiPatch): AiPatch {
  return {
    ...patch,
    operations: patch.operations.filter((operation) => {
      if (operation.type === 'add') {
        return Boolean(getCatalogItem(operation.catalogId))
      }

      if (operation.type === 'replace') {
        return Boolean(getCatalogItem(operation.nextCatalogId))
      }

      return true
    }),
  }
}
