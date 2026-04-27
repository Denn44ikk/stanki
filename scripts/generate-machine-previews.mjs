import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, parse } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const rootDir = process.cwd()
const sourceDir = join(rootDir, 'public', 'dxf-machines')
const outputDir = join(rootDir, 'public', 'dxf-machines-preview')

const PREVIEW_PROFILE = {
  name: 'showcase-png-balanced-v2',
  longSidePx: 1400,
  paddingFactor: 0.075,
  minPadding: 18,
  maxPadding: 86,
  maxCanvasAspectRatio: 3.2,
  minCanvasAspectRatio: 0.68,
  background: 'transparent',
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const files = readdirSync(sourceDir)
  .filter((file) => file.endsWith('.svg'))
  .sort((left, right) => left.localeCompare(right))

const manifest = []

for (const file of files) {
  const sourcePath = join(sourceDir, file)
  const sourceSvg = readFileSync(sourcePath, 'utf-8')
  const viewBox = parseViewBox(sourceSvg)
  const framedPreview = buildFramedPreviewSvg(sourceSvg, viewBox)
  const previewFile = `${parse(file).name}.png`
  const previewPath = join(outputDir, previewFile)
  const fitTo =
    framedPreview.canvasWidth >= framedPreview.canvasHeight
      ? { mode: 'width', value: PREVIEW_PROFILE.longSidePx }
      : { mode: 'height', value: PREVIEW_PROFILE.longSidePx }

  const resvg = new Resvg(framedPreview.svg, {
    background: PREVIEW_PROFILE.background,
    fitTo,
  })
  const pngData = resvg.render()

  writeFileSync(previewPath, pngData.asPng())

  manifest.push({
    file,
    previewFile,
    previewUrl: `/dxf-machines-preview/${previewFile}`,
    width: viewBox.width,
    height: viewBox.height,
    canvasWidth: framedPreview.canvasWidth,
    canvasHeight: framedPreview.canvasHeight,
    outputPixelWidth: pngData.width,
    outputPixelHeight: pngData.height,
    sourceBytes: statSync(sourcePath).size,
    previewBytes: statSync(previewPath).size,
    profile: PREVIEW_PROFILE.name,
  })
}

writeFileSync(
  join(outputDir, 'manifest.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      profile: PREVIEW_PROFILE,
      files: manifest,
    },
    null,
    2,
  ),
  'utf-8',
)

function buildFramedPreviewSvg(svg, viewBox) {
  const padding = clamp(
    Math.max(viewBox.width, viewBox.height) * PREVIEW_PROFILE.paddingFactor,
    PREVIEW_PROFILE.minPadding,
    PREVIEW_PROFILE.maxPadding,
  )
  let canvasWidth = viewBox.width + padding * 2
  let canvasHeight = viewBox.height + padding * 2
  const aspectRatio = canvasWidth / canvasHeight

  if (aspectRatio > PREVIEW_PROFILE.maxCanvasAspectRatio) {
    canvasHeight = canvasWidth / PREVIEW_PROFILE.maxCanvasAspectRatio
  } else if (aspectRatio < PREVIEW_PROFILE.minCanvasAspectRatio) {
    canvasWidth = canvasHeight * PREVIEW_PROFILE.minCanvasAspectRatio
  }

  const offsetX = (canvasWidth - viewBox.width) / 2
  const offsetY = (canvasHeight - viewBox.height) / 2
  const innerMarkup = extractInnerSvgMarkup(svg)
  const translateX = roundValue(offsetX - viewBox.minX)
  const translateY = roundValue(offsetY - viewBox.minY)

  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${roundValue(canvasWidth)} ${roundValue(canvasHeight)}" fill="none" shape-rendering="geometricPrecision">`,
      `  <g transform="translate(${translateX} ${translateY})">`,
      innerMarkup
        .trim()
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
      '  </g>',
      '</svg>',
    ].join('\n'),
    canvasWidth: roundValue(canvasWidth),
    canvasHeight: roundValue(canvasHeight),
  }
}

function parseViewBox(svg) {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/)
  if (viewBoxMatch) {
    const values = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value))

    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
      const [minX, minY, width, height] = values
      return { minX, minY, width, height }
    }
  }

  const widthMatch = svg.match(/width="([0-9.]+)"/)
  const heightMatch = svg.match(/height="([0-9.]+)"/)
  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : 100
  const height = heightMatch ? Number.parseFloat(heightMatch[1]) : 100

  return {
    minX: 0,
    minY: 0,
    width,
    height,
  }
}

function extractInnerSvgMarkup(svg) {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function roundValue(value) {
  return Number.parseFloat(value.toFixed(3))
}
