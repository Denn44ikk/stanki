import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import type { Project } from '../../shared/domain/contracts.js'
import { getCatalogItem, getTemplate } from '../../shared/domain/catalog.js'
import { getPlacementBounds } from '../../shared/domain/geometry.js'

export async function buildProjectPdf(project: Project) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([1190, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margin = 36
  const sidePanelWidth = 280
  const drawWidth = page.getWidth() - margin * 2 - sidePanelWidth
  const drawHeight = page.getHeight() - margin * 2
  const scale = Math.min(drawWidth / project.room.width, drawHeight / project.room.length)
  const roomWidth = project.room.width * scale
  const roomHeight = project.room.length * scale
  const originX = margin
  const originY = page.getHeight() - margin - roomHeight

  page.drawText(sanitizePdfText(project.title), {
    x: margin,
    y: page.getHeight() - 24,
    size: 18,
    font: boldFont,
  })

  page.drawRectangle({
    x: originX,
    y: originY,
    width: roomWidth,
    height: roomHeight,
    borderColor: rgb(0.1, 0.12, 0.16),
    borderWidth: 2,
  })

  page.drawText(
    sanitizePdfText(
      `Цех: ${project.room.width.toLocaleString('ru-RU')} x ${project.room.length.toLocaleString('ru-RU')} мм`,
    ),
    {
      x: originX,
      y: originY + roomHeight + 10,
      size: 10,
      font,
    },
  )

  for (const placement of project.placements) {
    const bounds = getPlacementBounds(placement)
    const x = originX + bounds.x * scale
    const y = originY + (project.room.length - (bounds.y + bounds.height)) * scale
    const color = hexToRgb(placement.color)
    const safetyPadding = placement.safetyZone * scale

    page.drawRectangle({
      x: x - safetyPadding,
      y: y - safetyPadding,
      width: bounds.width * scale + safetyPadding * 2,
      height: bounds.height * scale + safetyPadding * 2,
      borderColor: rgb(0.7, 0.64, 0.45),
      borderWidth: 1,
      opacity: 0.25,
    })

    page.drawRectangle({
      x,
      y,
      width: bounds.width * scale,
      height: bounds.height * scale,
      color,
      borderColor: rgb(0.1, 0.12, 0.16),
      borderWidth: 1.2,
    })

    page.drawText(sanitizePdfText(placement.label), {
      x: x + 4,
      y: y + bounds.height * scale - 14,
      size: 8,
      font: boldFont,
      color: rgb(1, 1, 1),
      maxWidth: Math.max(40, bounds.width * scale - 8),
    })
  }

  drawSidePanel(page, {
    x: page.getWidth() - sidePanelWidth + 8,
    y: page.getHeight() - 60,
    width: sidePanelWidth - 16,
    font,
    boldFont,
    project,
  })

  return pdf.save()
}

function drawSidePanel(
  page: PDFPage,
  options: {
    x: number
    y: number
    width: number
    font: PDFFont
    boldFont: PDFFont
    project: Project
  },
) {
  const { x, y, width, font, boldFont, project } = options
  let cursorY = y

  cursorY = drawSection(
    page,
    x,
    cursorY,
    width,
    'Проект',
    [
      `Режим: ${project.mode === 'ai' ? 'AI' : 'ручной'}`,
      `Статус: ${project.status}`,
      `Шаблон: ${getTemplate(project.templateId)?.name ?? 'не выбран'}`,
    ],
    font,
    boldFont,
  )

  cursorY = drawSection(
    page,
    x,
    cursorY,
    width,
    'Состав',
    project.items.map((item) => {
      const catalog = getCatalogItem(item.catalogId)
      return `${catalog?.code ?? item.catalogId} x${item.quantity}`
    }),
    font,
    boldFont,
  )

  drawSection(
    page,
    x,
    cursorY,
    width,
    'Предупреждения',
    project.warnings.length > 0 ? project.warnings : ['Нет конфликтов'],
    font,
    boldFont,
  )
}

function drawSection(
  page: PDFPage,
  x: number,
  startY: number,
  width: number,
  title: string,
  lines: string[],
  font: PDFFont,
  boldFont: PDFFont,
) {
  let cursorY = startY

  page.drawText(sanitizePdfText(title), {
    x,
    y: cursorY,
    size: 11,
    font: boldFont,
  })
  cursorY -= 16

  for (const line of lines.slice(0, 12)) {
    page.drawText(sanitizePdfText(line), {
      x,
      y: cursorY,
      size: 8.5,
      font,
      maxWidth: width,
      lineHeight: 10,
    })
    cursorY -= 12
  }

  return cursorY - 10
}

function sanitizePdfText(value: string) {
  return transliterate(value)
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function transliterate(value: string) {
  const lookup: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  return Array.from(value)
    .map((char) => {
      const lower = char.toLowerCase()
      const replacement = lookup[lower]

      if (!replacement) {
        return char
      }

      return char === lower
        ? replacement
        : `${replacement.slice(0, 1).toUpperCase()}${replacement.slice(1)}`
    })
    .join('')
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')

  if (normalized.length !== 6) {
    return rgb(0.4, 0.4, 0.4)
  }

  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  )
}
