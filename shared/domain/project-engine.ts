import { CATALOG, DEFAULT_ROOM, STOPWORDS, TEMPLATES, getCatalogItem, getTemplate } from './catalog.js'
import type {
  AiParseResult,
  AiPatch,
  AiPatchOperation,
  CatalogItem,
  LayoutPlacement,
  ParseExtractedItem,
  Project,
  ProjectItem,
  ProjectMode,
  RoomSpec,
} from './contracts.js'
import { findSafetyIntersections, getFootprintSize, isPlacementOutOfRoom } from './geometry.js'

const TEMPLATE_SEQUENCE_LOOKUP = new Map(
  TEMPLATES.map((template) => [
    template.id,
    new Map(template.sequence.map((itemId: string, index: number) => [itemId, index])),
  ]),
)

export function createEmptyProject(input: {
  title: string
  mode: ProjectMode
  room?: RoomSpec
  requestText?: string
}): Project {
  const timestamp = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    title: input.title,
    mode: input.mode,
    status: 'draft',
    room: input.room ?? DEFAULT_ROOM,
    requestText: input.requestText ?? '',
    notes: '',
    templateId: null,
    items: [],
    placements: [],
    warnings: [],
    lastParseResult: null,
    lastPendingPatch: null,
    patchHistory: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function parseRequestDeterministic(requestText: string): AiParseResult {
  const normalized = normalizeText(requestText)
  const extractedItems: ParseExtractedItem[] = []
  const matchedCatalogIds = new Set<string>()

  for (const item of CATALOG) {
    const matchedAlias = item.aliases.find((alias: string) =>
      hasAliasMatch(normalized, normalizeText(alias)),
    )

    if (!matchedAlias) {
      continue
    }

    matchedCatalogIds.add(item.id)
    extractedItems.push({
      catalogId: item.id,
      quantity: 1,
      sourceText: matchedAlias,
      chosenBy: 'ai',
      replacementReason: null,
      unresolvedFlag: false,
      confidence: matchedAlias === item.code.toLowerCase() ? 0.95 : 0.78,
      alternativeCatalogIds: item.analogs,
    })
  }

  const suggestedTemplateId = chooseTemplateId(
    extractedItems.map((item) => item.catalogId),
  )
  const unresolvedTokens = extractUnresolvedTokens(normalized, matchedCatalogIds)
  const warnings: string[] = []

  if (extractedItems.length === 0) {
    warnings.push('Не удалось уверенно распознать оборудование по тексту менеджера.')
  }

  if (unresolvedTokens.length > 0) {
    warnings.push(
      `Есть нераспознанные токены: ${unresolvedTokens.slice(0, 8).join(', ')}.`,
    )
  }

  return {
    extractedItems,
    unresolvedTokens,
    suggestedTemplateId,
    warnings,
    explanation:
      extractedItems.length > 0
        ? 'Детерминированный разбор по каталогу и алиасам.'
        : 'Нужна ручная доработка или AI-помощь для разбора текста.',
  }
}

export function materializeParseResult(
  parseResult: AiParseResult,
  existingItems: ProjectItem[] = [],
) {
  const nextItems = parseResult.extractedItems.map((item) => ({
    id: crypto.randomUUID(),
    catalogId: item.catalogId,
    quantity: item.quantity,
    sourceText: item.sourceText,
    chosenBy: item.chosenBy,
    replacementReason: item.replacementReason,
    unresolvedFlag: item.unresolvedFlag,
  }))

  return [...existingItems, ...nextItems]
}

export function generateLayoutForProject(project: Project): {
  placements: LayoutPlacement[]
  warnings: string[]
} {
  const template = getTemplate(project.templateId)
  const room = project.room
  const orderLookup =
    template ? TEMPLATE_SEQUENCE_LOOKUP.get(template.id) ?? new Map() : new Map()
  const orderedItems = [...project.items].sort((first, second) => {
    const firstIndex = orderLookup.get(first.catalogId) ?? Number.MAX_SAFE_INTEGER
    const secondIndex = orderLookup.get(second.catalogId) ?? Number.MAX_SAFE_INTEGER

    if (firstIndex === secondIndex) {
      return first.catalogId.localeCompare(second.catalogId, 'ru-RU')
    }

    return firstIndex - secondIndex
  })

  const spacingX = template?.spacingX ?? 1800
  const spacingY = template?.spacingY ?? 1600
  const paddingX = template?.paddingX ?? 1400
  const paddingY = template?.paddingY ?? 1400
  const previousManual = new Map(
    project.placements
      .filter((placement) => placement.manuallyAdjusted)
      .map((placement) => [placement.projectItemId, placement]),
  )
  const placements: LayoutPlacement[] = []

  let currentX = paddingX
  let currentY = paddingY
  let rowHeight = 0

  for (const projectItem of orderedItems) {
    const catalogItem = getCatalogItem(projectItem.catalogId)

    if (!catalogItem) {
      continue
    }

    for (let quantityIndex = 0; quantityIndex < projectItem.quantity; quantityIndex += 1) {
      const manualPlacement = previousManual.get(projectItem.id)

      if (manualPlacement) {
        placements.push(manualPlacement)
        continue
      }

      const rotation = 90
      const footprint = getFootprintSize(
        catalogItem.width,
        catalogItem.length,
        rotation,
      )

      if (
        currentX + footprint.width + catalogItem.safetyZone >
        room.width - paddingX
      ) {
        currentX = paddingX
        currentY += rowHeight + spacingY
        rowHeight = 0
      }

      const placement: LayoutPlacement = {
        id: crypto.randomUUID(),
        projectItemId: projectItem.id,
        catalogId: catalogItem.id,
        label:
          projectItem.quantity > 1
            ? `${catalogItem.code} #${quantityIndex + 1}`
            : catalogItem.code,
        x: fitCenter(currentX + footprint.width / 2, footprint.width / 2, room.width),
        y: fitCenter(currentY + footprint.height / 2, footprint.height / 2, room.length),
        rotation,
        width: catalogItem.width,
        length: catalogItem.length,
        safetyZone: catalogItem.safetyZone,
        color: catalogItem.color,
        manuallyAdjusted: false,
      }

      placements.push(placement)
      currentX += footprint.width + spacingX + catalogItem.safetyZone * 2
      rowHeight = Math.max(
        rowHeight,
        footprint.height + catalogItem.safetyZone * 2,
      )
    }
  }

  const warnings = computePlacementWarnings(room, placements)
  return { placements, warnings }
}

export function buildAiPatchFallback(
  project: Project,
  instruction: string,
): AiPatch {
  const normalized = normalizeText(instruction)
  const operations: AiPatchOperation[] = []
  const warnings: string[] = []

  if (normalized.includes('замени')) {
    const catalogIds = findCatalogIdsInText(normalized)

    if (catalogIds.length >= 2) {
      const targetItem = project.items.find((item) => item.catalogId === catalogIds[0])

      if (targetItem) {
        operations.push({
          type: 'replace',
          targetProjectItemId: targetItem.id,
          nextCatalogId: catalogIds[1],
          sourceText: instruction,
          replacementReason: 'Замена по AI-команде',
        })
      }
    }
  }

  if (
    operations.length === 0 &&
    (normalized.includes('удали') || normalized.includes('убери') || normalized.includes('исключ'))
  ) {
    const catalogIds = findCatalogIdsInText(normalized)

    if (catalogIds.length > 0) {
      const targetItem = project.items.find((item) => item.catalogId === catalogIds[0])

      if (targetItem) {
        operations.push({
          type: 'remove',
          targetProjectItemId: targetItem.id,
          sourceText: instruction,
        })
      }
    }
  }

  if (operations.length === 0 && normalized.includes('добав')) {
    const catalogIds = findCatalogIdsInText(normalized)

    if (catalogIds.length > 0) {
      operations.push({
        type: 'add',
        catalogId: catalogIds[0],
        quantity: 1,
        sourceText: instruction,
      })
    }
  }

  if (operations.length === 0 && normalized.includes('повер')) {
    const catalogIds = findCatalogIdsInText(normalized)
    const placement = project.placements.find((candidate) =>
      catalogIds.length > 0
        ? candidate.catalogId === catalogIds[0]
        : project.placements.length > 0,
    )

    if (placement) {
      operations.push({
        type: 'rotate',
        targetPlacementId: placement.id,
        rotation: placement.rotation === 0 ? 90 : 0,
        sourceText: instruction,
      })
    }
  }

  if (operations.length === 0) {
    warnings.push('Не удалось построить структурированный патч по команде.')
  }

  return {
    prompt: instruction,
    operations,
    warnings,
    explanation:
      operations.length > 0
        ? 'Патч построен детерминированно по известным алиасам.'
        : 'Нужна более точная инструкция или реальный AI-вызов.',
  }
}

export function applyPatchToProject(project: Project, patch: AiPatch): Project {
  let nextProject: Project = {
    ...project,
    items: [...project.items],
    placements: [...project.placements],
    patchHistory: [...project.patchHistory, patch],
    lastPendingPatch: null,
  }

  for (const operation of patch.operations) {
    switch (operation.type) {
      case 'add': {
        nextProject.items.push({
          id: crypto.randomUUID(),
          catalogId: operation.catalogId,
          quantity: operation.quantity,
          sourceText: operation.sourceText,
          chosenBy: 'ai',
          replacementReason: null,
          unresolvedFlag: false,
        })
        break
      }
      case 'remove': {
        nextProject = {
          ...nextProject,
          items: nextProject.items.filter(
            (item) => item.id !== operation.targetProjectItemId,
          ),
          placements: nextProject.placements.filter(
            (placement) => placement.projectItemId !== operation.targetProjectItemId,
          ),
        }
        break
      }
      case 'replace': {
        nextProject = {
          ...nextProject,
          items: nextProject.items.map((item) =>
            item.id === operation.targetProjectItemId
              ? {
                  ...item,
                  catalogId: operation.nextCatalogId,
                  replacementReason: operation.replacementReason,
                }
              : item,
          ),
          placements: nextProject.placements.filter(
            (placement) => placement.projectItemId !== operation.targetProjectItemId,
          ),
        }
        break
      }
      case 'move': {
        nextProject = {
          ...nextProject,
          placements: nextProject.placements.map((placement) =>
            placement.id === operation.targetPlacementId
              ? {
                  ...placement,
                  x: operation.x,
                  y: operation.y,
                  manuallyAdjusted: true,
                }
              : placement,
          ),
        }
        break
      }
      case 'rotate': {
        nextProject = {
          ...nextProject,
          placements: nextProject.placements.map((placement) =>
            placement.id === operation.targetPlacementId
              ? {
                  ...placement,
                  rotation: operation.rotation,
                  manuallyAdjusted: true,
                }
              : placement,
          ),
        }
        break
      }
    }
  }

  if (patch.operations.some((operation) => ['add', 'remove', 'replace'].includes(operation.type))) {
    const layoutResult = generateLayoutForProject(nextProject)
    nextProject = {
      ...nextProject,
      placements: layoutResult.placements,
      warnings: layoutResult.warnings,
      status: 'layout_ready',
    }
  } else {
    nextProject = {
      ...nextProject,
      warnings: computePlacementWarnings(nextProject.room, nextProject.placements),
      status: 'layout_ready',
    }
  }

  return nextProject
}

export function touchProject(project: Project): Project {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  }
}

export function buildProjectSummary(project: Project) {
  return {
    id: project.id,
    title: project.title,
    mode: project.mode,
    status: project.status,
    updatedAt: project.updatedAt,
    itemCount: project.items.length,
    placementCount: project.placements.length,
  }
}

export function findCatalogIdsInText(value: string) {
  return CATALOG.filter((item) =>
    item.aliases.some((alias: string) => hasAliasMatch(value, normalizeText(alias))),
  ).map((item) => item.id)
}

function chooseTemplateId(catalogIds: string[]) {
  let bestTemplateId: string | null = null
  let bestScore = 0

  for (const template of TEMPLATES) {
    const score = template.sequence.filter((itemId: string) => catalogIds.includes(itemId)).length

    if (score > bestScore) {
      bestScore = score
      bestTemplateId = template.id
    }
  }

  return bestTemplateId
}

function extractUnresolvedTokens(
  normalizedText: string,
  matchedCatalogIds: Set<string>,
) {
  const aliasLookup = new Set(
    CATALOG.filter((item) => matchedCatalogIds.has(item.id)).flatMap((item) =>
      item.aliases.map((alias: string) => normalizeText(alias)),
    ),
  )

  return normalizedText
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !aliasLookup.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 12)
}

export function computePlacementWarnings(room: RoomSpec, placements: LayoutPlacement[]) {
  const warnings = findSafetyIntersections(placements).map((warning) => warning.message)

  for (const placement of placements) {
    if (isPlacementOutOfRoom(placement, room)) {
      warnings.push(`${placement.label} выходит за границы помещения.`)
    }
  }

  return warnings
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAliasMatch(text: string, alias: string) {
  if (!alias) {
    return false
  }

  return text === alias || text.includes(alias)
}

function fitCenter(value: number, halfSize: number, roomSize: number) {
  if (roomSize <= halfSize * 2) {
    return roomSize / 2
  }

  return clamp(value, halfSize, roomSize - halfSize)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function hydrateCatalogItem(catalogId: string): CatalogItem | null {
  return getCatalogItem(catalogId)
}
