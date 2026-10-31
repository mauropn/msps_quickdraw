// msps: borracha parcial — apaga só o pedaço do traço que a borracha toca, como uma
// borracha de verdade, partindo o traço em pedaços. A borracha é um círculo (raio
// fixo na tela) arrastado de um ponto ao outro: a "cápsula" do movimento apaga
// tudo o que passa por baixo, mesmo num gesto rápido.
// Só traços de tinta (draw / highlight) são cortados; as outras formas continuam
// sendo apagadas inteiras.
// Dependency-free ESM (see palette.js).

import { SIZES, INK_SIZES, HIGHLIGHT_SCALE } from './palette.js'
import { penReach } from './pens.js'
import { localBounds, pageBounds, toLocal } from './shapes.js'
import { rotWith } from './geometry.js'

/** 'stroke' = apaga o traço inteiro (como a lib original); 'partial' = só o pedaço tocado. */
export const ERASER_MODES = ['stroke', 'partial']

/** Raio da borracha em px de TELA (o mesmo tamanho na mão em qualquer zoom). */
export const ERASER_SIZES = { s: 6, m: 12, l: 24 }
export const ERASER_SIZE_IDS = ['s', 'm', 'l']

/** Ponta-borracha da caneta (o botão "eraser" do Pointer Events, buttons & 32 / button 5). */
export function isPenEraser(e) {
  return e.pointerType === 'pen' && (((e.buttons ?? 0) & 32) !== 0 || e.button === 5)
}

export const isInkShape = (shape) => shape.type === 'draw' || shape.type === 'highlight'

// meia largura da tinta: a borracha precisa só encostar na borda do traço
function inkHalfWidth(shape) {
  const p = shape.props
  if (shape.type === 'highlight') return (SIZES[p.size] * HIGHLIGHT_SCALE) / 2
  if (p.pen) return penReach(p.pen, INK_SIZES[p.size]) / 2
  return (INK_SIZES[p.size] + 1) / 2
}

// distância² do ponto (px,py) ao segmento a→b
function distSqToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const x = ax + t * dx - px
  const y = ay + t * dy - py
  return x * x + y * y
}

/**
 * Corta um traço de tinta pela cápsula a→b de raio r (espaço da página).
 * Devolve null se a borracha não tocou o traço; senão a lista de pedaços que
 * sobram, cada um como pts locais [x, y, pressão, ...] (lista vazia = apagou tudo).
 */
export function cutInkPoints(shape, a, b, r) {
  const pts = shape.props.pts
  const reach = r + inkHalfWidth(shape)
  // descarte rápido pelos limites
  const pb = pageBounds(shape)
  if (Math.min(a.x, b.x) - reach > pb.x + pb.w || Math.max(a.x, b.x) + reach < pb.x ||
      Math.min(a.y, b.y) - reach > pb.y + pb.h || Math.max(a.y, b.y) + reach < pb.y) return null

  // a cápsula no espaço do traço (a rotação preserva distâncias)
  const la = toLocal(shape, a.x, a.y)
  const lb = toLocal(shape, b.x, b.y)
  const reach2 = reach * reach
  const n = Math.floor(pts.length / 3)
  const hits = (x, y) => distSqToSegment(x, y, la.x, la.y, lb.x, lb.y) <= reach2

  if (n <= 1) return n === 1 && hits(pts[0], pts[1]) ? [] : null

  // pontos esparsos (mouse rápido) ganham pontos intermediários só onde a borracha
  // pode estar, para o corte cair no lugar certo e não sumir um segmento inteiro
  const step = Math.max(0.5, reach / 2)
  const cMinX = Math.min(la.x, lb.x) - reach, cMaxX = Math.max(la.x, lb.x) + reach
  const cMinY = Math.min(la.y, lb.y) - reach, cMaxY = Math.max(la.y, lb.y) + reach
  const out = [] // [x, y, p, apagado?]
  let touched = false
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], p = pts[i * 3 + 2]
    if (i > 0) {
      const px = pts[(i - 1) * 3], py = pts[(i - 1) * 3 + 1], pp = pts[(i - 1) * 3 + 2]
      const len = Math.hypot(x - px, y - py)
      if (len > step && Math.max(x, px) >= cMinX && Math.min(x, px) <= cMaxX &&
          Math.max(y, py) >= cMinY && Math.min(y, py) <= cMaxY) {
        const k = Math.ceil(len / step)
        for (let j = 1; j < k; j++) {
          const t = j / k
          const ix = px + (x - px) * t, iy = py + (y - py) * t
          const hit = hits(ix, iy)
          touched ||= hit
          out.push(ix, iy, pp + (p - pp) * t, hit ? 1 : 0)
        }
      }
    }
    const hit = hits(x, y)
    touched ||= hit
    out.push(x, y, p, hit ? 1 : 0)
  }
  if (!touched) return null

  // trechos que sobraram (um ponto solto não vira um pingo)
  const pieces = []
  let run = []
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]) {
      if (run.length >= 6) pieces.push(run)
      run = []
    } else {
      run.push(round2(out[i]), round2(out[i + 1]), out[i + 2])
    }
  }
  if (run.length >= 6) pieces.push(run)
  return pieces
}

const round2 = (v) => Math.round(v * 100) / 100

/**
 * Os pedaços como registros do store: o primeiro reaproveita o id do traço (o
 * resto ganha ids novos). Traço girado vira pedaços sem rotação, com os pontos
 * já na posição da página — senão cada pedaço giraria em torno de outro centro.
 */
export function inkPiecesToShapes(shape, pieces, newId) {
  const rot = shape.rot || 0
  let center = null
  if (rot) {
    const lb = localBounds(shape)
    center = { x: shape.x + lb.x + lb.w / 2, y: shape.y + lb.y + lb.h / 2 }
  }
  return pieces.map((pts, i) => {
    const id = i === 0 ? shape.id : newId()
    const z = shape.z + i * 1e-6
    if (!rot) return { ...shape, id, z, props: { ...shape.props, pts } }
    const abs = []
    for (let k = 0; k < pts.length; k += 3) {
      const r = rotWith(shape.x + pts[k], shape.y + pts[k + 1], center.x, center.y, rot)
      abs.push(r.x, r.y, pts[k + 2])
    }
    const ox = abs[0], oy = abs[1]
    const local = []
    for (let k = 0; k < abs.length; k += 3) local.push(round2(abs[k] - ox), round2(abs[k + 1] - oy), abs[k + 2])
    return { ...shape, id, z, x: ox, y: oy, rot: 0, props: { ...shape.props, pts: local } }
  })
}
