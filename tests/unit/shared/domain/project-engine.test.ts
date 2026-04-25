import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '../../../../shared/domain/catalog.js'
import type { Project } from '../../../../shared/domain/contracts.js'
import {
  applyPatchToProject,
  createEmptyProject,
  generateLayoutForProject,
  materializeParseResult,
  parseRequestDeterministic,
} from '../../../../shared/domain/project-engine.js'
import { buildProjectDxf } from '../../../../shared/exporters/dxf.js'
import { buildProjectPdf } from '../../../../server/exports/pdf.js'

describe('project-engine', () => {
  it('parses manager text into known catalog items and template', () => {
    const result = parseRequestDeterministic(
      'Поставить: НБ ПБ ВР С-750 ТЦЛ ТЦП Б700 рольганги М1000',
    )

    expect(result.suggestedTemplateId).toBe('s750-automation')
    expect(result.extractedItems.map((item) => item.catalogId)).toEqual(
      expect.arrayContaining([
        'nb',
        'pb',
        'vr',
        's750',
        'tcl',
        'tcp',
        'b700',
        'rolgang',
        'm1000',
      ]),
    )
  })

  it('generates a deterministic layout for confirmed items', () => {
    const parseResult = parseRequestDeterministic(
      'стандартная комплектация без автоматизации со станками: С750 Б700 М1000 ГС 4',
    )
    const project: Project = {
      ...createEmptyProject({
        title: 'С750',
        mode: 'ai',
        room: DEFAULT_ROOM,
      }),
      items: materializeParseResult(parseResult),
      templateId: parseResult.suggestedTemplateId,
    }

    const layout = generateLayoutForProject(project)

    expect(layout.placements).toHaveLength(4)
    expect(layout.warnings).toEqual([])
  })

  it('applies a replace patch and regenerates the layout', () => {
    const parseResult = parseRequestDeterministic(
      'стандартная комплектация без автоматизации со станками: С750 Б700 М1000 ГС 4',
    )
    const project: Project = {
      ...createEmptyProject({
        title: 'С750',
        mode: 'ai',
        room: DEFAULT_ROOM,
      }),
      items: materializeParseResult(parseResult),
      templateId: parseResult.suggestedTemplateId,
      ...generateLayoutForProject({
        ...createEmptyProject({
          title: 'С750',
          mode: 'ai',
          room: DEFAULT_ROOM,
        }),
        items: materializeParseResult(parseResult),
        templateId: parseResult.suggestedTemplateId,
      }),
    }

    const b700Item = project.items.find((item) => item.catalogId === 'b700')

    expect(b700Item).toBeTruthy()

    const nextProject = applyPatchToProject(project, {
      prompt: 'замени Б700 на М1000',
      explanation: 'test',
      warnings: [],
      operations: [
        {
          type: 'replace',
          targetProjectItemId: b700Item!.id,
          nextCatalogId: 'm1000',
          sourceText: 'замени Б700 на М1000',
          replacementReason: 'test',
        },
      ],
    })

    expect(nextProject.items.some((item) => item.catalogId === 'b700')).toBe(false)
    expect(nextProject.items.filter((item) => item.catalogId === 'm1000')).toHaveLength(2)
    expect(nextProject.placements.length).toBe(nextProject.items.length)
  })

  it('builds DXF and PDF exports from the project model', async () => {
    const parseResult = parseRequestDeterministic(
      'поставить: стол-комплект Вр станок для тонкомера ТЦЛ Б700 рольганги',
    )
    const baseProject = createEmptyProject({
      title: 'Тонкомер',
      mode: 'ai',
      room: DEFAULT_ROOM,
    })
    const layout = generateLayoutForProject({
      ...baseProject,
      items: materializeParseResult(parseResult),
      templateId: parseResult.suggestedTemplateId,
    })
    const project: Project = {
      ...baseProject,
      items: materializeParseResult(parseResult),
      templateId: parseResult.suggestedTemplateId,
      placements: layout.placements,
      warnings: layout.warnings,
    }

    const dxf = buildProjectDxf({
      title: project.title,
      room: project.room,
      placements: project.placements,
    })
    const pdf = await buildProjectPdf(project)

    expect(dxf.startsWith('0\nSECTION\n2\nENTITIES')).toBe(true)
    expect(dxf).toContain('0\nLINE\n8\nEQUIPMENT')
    expect(pdf[0]).toBe(0x25)
    expect(pdf[1]).toBe(0x50)
    expect(pdf[2]).toBe(0x44)
    expect(pdf[3]).toBe(0x46)
  })
})
