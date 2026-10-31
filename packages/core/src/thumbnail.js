// msps: miniatura do quadro para listas (ex.: lista de notas).
// Mostra o começo da página como um caderno: largura do conteúdo cabendo na
// miniatura e corte embaixo — escrita é de cima para baixo, então o topo é o
// que reconhece a nota. Com papel, começa na borda esquerda do papel (a
// margem aparece). Síncrono: dá para gerar junto com o salvamento.

import { themeOf } from './palette.js'
import { pageBounds } from './shapes.js'
import { boundsUnion } from './geometry.js'
import { paperExportBounds } from './paper.js'

const THUMB_PAD = 12

/**
 * Data URL (webp; jpeg onde o navegador não gera webp) da miniatura, ou null
 * se o quadro está vazio ou não há canvas.
 * opts: { width = 480, height = 200, theme = 'light', quality = 0.7, maxZoom = 1, minZoom = 0.12 }
 */
export function renderThumbnail(editor, opts = {}) {
  const { width = 480, height = 200, theme = 'light', quality = 0.7, maxZoom = 1, minZoom = 0.12 } = opts
  if (typeof document === 'undefined') return null
  const shapes = editor.store.shapes()
  if (!shapes.length) return null
  let b = shapes.map(pageBounds).reduce((acc, sb) => (acc ? boundsUnion(acc, sb) : sb), null)
  if (editor.paper) b = paperExportBounds(b, editor.paper)
  const pad = THUMB_PAD
  const z = Math.max(minZoom, Math.min(maxZoom, (width - pad * 2) / Math.max(1, b.w)))
  // com papel, a borda do papel encosta na borda da miniatura; sem papel, um respiro
  const left = editor.paper && b.x === 0 ? 0 : pad / z
  const top = editor.paper && b.y === 0 ? 0 : pad / z
  const cam = { x: -(b.x - left), y: -(b.y - top), z }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const prev = editor.theme
  editor.theme = themeOf(theme)
  try {
    editor.renderScene(ctx, cam, width, height, { dpr: 1, background: true })
  } finally {
    editor.theme = prev
  }
  let url = ''
  try {
    url = canvas.toDataURL('image/webp', quality)
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
  return url.startsWith('data:image/') ? url : null
}
