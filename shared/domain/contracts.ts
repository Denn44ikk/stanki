import { z } from 'zod'

export const rotationSchema = z.union([z.literal(0), z.literal(90)])
export const projectModeSchema = z.enum(['manual', 'ai'])
export const projectStatusSchema = z.enum([
  'draft',
  'needs_confirmation',
  'layout_ready',
  'patch_review',
])
export const chosenBySchema = z.enum(['manual', 'ai'])

export const roomSpecSchema = z.object({
  width: z.number().int().positive(),
  length: z.number().int().positive(),
  unit: z.literal('mm').default('mm'),
})

export const catalogItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  family: z.string(),
  color: z.string(),
  width: z.number().int().positive(),
  length: z.number().int().positive(),
  safetyZone: z.number().int().nonnegative(),
  aliases: z.array(z.string()),
  analogs: z.array(z.string()),
  description: z.string().default(''),
})

export const layoutTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  suggestedRoom: roomSpecSchema,
  sequence: z.array(z.string()),
  allowedFamilies: z.array(z.string()),
  spacingX: z.number().int().positive(),
  spacingY: z.number().int().positive(),
  paddingX: z.number().int().positive(),
  paddingY: z.number().int().positive(),
})

export const projectItemSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  quantity: z.number().int().positive(),
  sourceText: z.string(),
  chosenBy: chosenBySchema,
  replacementReason: z.string().nullable().default(null),
  unresolvedFlag: z.boolean().default(false),
})

export const layoutPlacementSchema = z.object({
  id: z.string(),
  projectItemId: z.string(),
  catalogId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: rotationSchema,
  width: z.number().int().positive(),
  length: z.number().int().positive(),
  safetyZone: z.number().int().nonnegative(),
  color: z.string(),
  manuallyAdjusted: z.boolean().default(false),
})

export const parseExtractedItemSchema = z.object({
  catalogId: z.string(),
  quantity: z.number().int().positive().default(1),
  sourceText: z.string(),
  chosenBy: z.literal('ai').default('ai'),
  replacementReason: z.string().nullable().default(null),
  unresolvedFlag: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
  alternativeCatalogIds: z.array(z.string()).default([]),
})

export const aiParseResultSchema = z.object({
  extractedItems: z.array(parseExtractedItemSchema),
  unresolvedTokens: z.array(z.string()),
  suggestedTemplateId: z.string().nullable(),
  warnings: z.array(z.string()),
  explanation: z.string().default(''),
})

export const aiPatchOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add'),
    catalogId: z.string(),
    quantity: z.number().int().positive().default(1),
    sourceText: z.string(),
  }),
  z.object({
    type: z.literal('remove'),
    targetProjectItemId: z.string(),
    sourceText: z.string(),
  }),
  z.object({
    type: z.literal('replace'),
    targetProjectItemId: z.string(),
    nextCatalogId: z.string(),
    sourceText: z.string(),
    replacementReason: z.string().default('AI suggestion'),
  }),
  z.object({
    type: z.literal('move'),
    targetPlacementId: z.string(),
    x: z.number(),
    y: z.number(),
    sourceText: z.string(),
  }),
  z.object({
    type: z.literal('rotate'),
    targetPlacementId: z.string(),
    rotation: rotationSchema,
    sourceText: z.string(),
  }),
])

export const aiPatchSchema = z.object({
  prompt: z.string(),
  operations: z.array(aiPatchOperationSchema),
  warnings: z.array(z.string()),
  explanation: z.string(),
})

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: projectModeSchema,
  status: projectStatusSchema,
  room: roomSpecSchema,
  requestText: z.string(),
  notes: z.string(),
  templateId: z.string().nullable(),
  items: z.array(projectItemSchema),
  placements: z.array(layoutPlacementSchema),
  warnings: z.array(z.string()),
  lastParseResult: aiParseResultSchema.nullable(),
  lastPendingPatch: aiPatchSchema.nullable(),
  patchHistory: z.array(aiPatchSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const projectSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: projectModeSchema,
  status: projectStatusSchema,
  updatedAt: z.string(),
  itemCount: z.number().int().nonnegative(),
  placementCount: z.number().int().nonnegative(),
})

export const createProjectInputSchema = z.object({
  title: z.string().trim().min(1),
  mode: projectModeSchema,
  room: roomSpecSchema.optional(),
  requestText: z.string().default(''),
})

export const updateProjectInputSchema = z.object({
  title: z.string().trim().min(1),
  status: projectStatusSchema,
  room: roomSpecSchema,
  requestText: z.string(),
  notes: z.string(),
  templateId: z.string().nullable(),
  items: z.array(projectItemSchema),
  placements: z.array(layoutPlacementSchema),
  warnings: z.array(z.string()),
  lastParseResult: aiParseResultSchema.nullable(),
  lastPendingPatch: aiPatchSchema.nullable(),
  patchHistory: z.array(aiPatchSchema),
})

export const aiParseInputSchema = z.object({
  requestText: z.string().trim().min(1),
})

export const generateLayoutInputSchema = z.object({
  templateId: z.string().nullable().optional(),
})

export const aiEditInputSchema = z.object({
  instruction: z.string().trim().min(1),
})

export const applyPatchInputSchema = z.object({
  patch: aiPatchSchema,
})

export const systemStatusSchema = z.object({
  aiEnabled: z.boolean(),
  provider: z.enum(['openrouter', 'fallback']),
  model: z.string().nullable(),
})

export type Rotation = z.infer<typeof rotationSchema>
export type ProjectMode = z.infer<typeof projectModeSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type ChosenBy = z.infer<typeof chosenBySchema>
export type RoomSpec = z.infer<typeof roomSpecSchema>
export type CatalogItem = z.infer<typeof catalogItemSchema>
export type LayoutTemplate = z.infer<typeof layoutTemplateSchema>
export type ProjectItem = z.infer<typeof projectItemSchema>
export type LayoutPlacement = z.infer<typeof layoutPlacementSchema>
export type ParseExtractedItem = z.infer<typeof parseExtractedItemSchema>
export type AiParseResult = z.infer<typeof aiParseResultSchema>
export type AiPatchOperation = z.infer<typeof aiPatchOperationSchema>
export type AiPatch = z.infer<typeof aiPatchSchema>
export type Project = z.infer<typeof projectSchema>
export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>
export type AiParseInput = z.infer<typeof aiParseInputSchema>
export type GenerateLayoutInput = z.infer<typeof generateLayoutInputSchema>
export type AiEditInput = z.infer<typeof aiEditInputSchema>
export type ApplyPatchInput = z.infer<typeof applyPatchInputSchema>
export type SystemStatus = z.infer<typeof systemStatusSchema>
