// msps: escrita rápida (opção `fastInk` do Editor).
//
// Sem ela, cada movimento da caneta copia o traço inteiro para o store (que
// avisa todo mundo que ouve) e cada quadro redesenha a tela toda — papel e
// todos os traços. Com ela, durante o traço:
// - os pontos ficam num buffer da sessão; o store recebe o traço de tempos em
//   tempos (LIVE_COMMIT_MS) e no fim — o desfazer continua um passo só;
// - o resto da tela vira uma imagem (cache) feita uma vez, e cada quadro só
//   cola essa imagem e desenha o traço em andamento por cima;
// - o contorno do traço é incremental (liveink.js);
// - os pontos previstos do navegador (getPredictedEvents) estendem a ponta só
//   na tela, para o traço acompanhar a caneta mais de perto.

import { createLiveOutline } from './liveink.js'
import { inkOptions } from './freehand.js'
import { penInkOptions } from './pens.js'
import { INK_SIZES } from './palette.js'
import { traceSmooth } from './geometry.js'
import { drawShape } from './shapes.js'

/** De quanto em quanto tempo o traço em andamento vai para o store (ms). */
export const LIVE_COMMIT_MS = 120

const hundredth = (v) => Math.round(v * 100) / 100
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// as mesmas opções de tinta que shapes.js usa para o traço não terminado
function liveOutlineFor(shape) {
  const p = shape.props
  if (shape.type !== 'draw' || (!p.pen && p.dash && p.dash !== 'draw')) return null
  const ink = { isPen: !!p.isPen, done: false }
  return createLiveOutline(p.pen ? penInkOptions(p.pen, INK_SIZES[p.size], ink) : inkOptions(INK_SIZES[p.size], ink))
}

/** Estado do traço em andamento, guardado em session.live. */
export function createLiveInk(shape) {
  return {
    base: shape,
    pts: shape.props.pts.slice(),
    predicted: null,
    outline: liveOutlineFor(shape),
    version: 0,
    committed: 0,
    lastCommit: now(),
  }
}

/** Manda os pontos atuais para o store (se mudaram desde a última vez). */
export function commitLiveInk(editor) {
  const ss = editor.session
  const live = ss?.live
  if (!live || live.committed === live.version) return
  live.committed = live.version
  live.lastCommit = now()
  editor.store.update(ss.id, { props: { pts: live.pts.slice() } })
}

/** Fim (ou cancelamento) do traço: o cache da tela não vale mais. */
export function endLiveInk(editor) {
  editor._sceneVer = (editor._sceneVer || 0) + 1
  if (editor._sceneCache) editor._sceneCache.key = null
}

/**
 * _extendDraw da escrita rápida: mesma regra de pontos do original (a caneta
 * funde movimentos menores que um pixel da tela no último ponto), mas no
 * buffer da sessão.
 */
export function extendLiveInk(editor, e) {
  const ss = editor.session
  const live = ss.live
  if (!editor.store.get(ss.id)) { editor.session = null; endLiveInk(editor); return }
  const base = live.base
  const pen = !!base.props.isPen
  const zoom = ss.zoom ?? (ss.zoom = editor.camera.z)
  // uma medida do container por evento (não uma por ponto agrupado)
  const rect = editor.container.getBoundingClientRect()
  const toPage = (ce) => editor.screenToPage(ce.clientX - rect.left, ce.clientY - rect.top)
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
  const pts = live.pts
  let changed = false
  for (const ce of evs.length ? evs : [e]) {
    const cp = toPage(ce)
    const x = hundredth(cp.x - base.x), y = hundredth(cp.y - base.y), z = hundredth(ce.pressure || 0.5)
    const k = pts.length - 3
    if (pen && Math.hypot(cp.x - ss.last.x, cp.y - ss.last.y) < 1 / zoom) {
      const nz = pts[k + 2] ? Math.max(pts[k + 2], z) : z
      if (pts[k] !== x || pts[k + 1] !== y || pts[k + 2] !== nz) {
        pts[k] = x
        pts[k + 1] = y
        pts[k + 2] = nz
        changed = true
      }
      continue
    }
    if (pts[k] === x && pts[k + 1] === y) continue
    if (pen) ss.last = cp
    pts.push(x, y, z)
    changed = true
  }

  // pontos previstos: só na tela, com a pressão do último ponto real
  const hadPrediction = !!live.predicted
  live.predicted = null
  const predicted = editor.predictInk !== false && e.getPredictedEvents ? e.getPredictedEvents() : null
  if (predicted?.length) {
    const z = pts[pts.length - 1]
    const flat = []
    for (const pe of predicted) {
      const cp = toPage(pe)
      flat.push(hundredth(cp.x - base.x), hundredth(cp.y - base.y), z)
    }
    live.predicted = flat
  }

  if (changed) live.version++
  if (now() - live.lastCommit >= LIVE_COMMIT_MS) commitLiveInk(editor)
  if (changed || hadPrediction || live.predicted) editor.requestRender()
}

/**
 * O store mudou: se foi algo além do traço em andamento (outro traço, uma
 * mudança remota), o cache da tela precisa ser refeito.
 */
export function noteSceneChange(editor, diff) {
  const id = editor.session?.live ? editor.session.id : null
  const other = (map) => { for (const k in map) if (k !== id) return true; return false }
  if (!id || other(diff.added) || other(diff.removed) || other(diff.updated)) {
    editor._sceneVer = (editor._sceneVer || 0) + 1
  }
}

/**
 * Desenha a tela durante a escrita rápida: o cache (tudo menos o traço em
 * andamento) e o traço por cima. false = não há traço rápido; o chamador
 * desenha do jeito normal.
 */
export function renderLiveInk(editor, ctx, w, h, dpr) {
  const ss = editor.session
  const live = ss?.type === 'drawing' ? ss.live : null
  if (!live || typeof document === 'undefined') return false
  const shape = editor.store.get(ss.id)
  if (!shape) return false
  const cam = editor.camera
  const W = ctx.canvas.width, H = ctx.canvas.height
  const key = [W, H, dpr, cam.x, cam.y, cam.z, editor.theme.id, editor.grid, JSON.stringify(editor.paper), editor._sceneVer || 0].join('|')
  let cache = editor._sceneCache
  if (!cache) {
    const canvas = document.createElement('canvas')
    const cctx = canvas.getContext('2d')
    if (!cctx) return false
    cache = editor._sceneCache = { canvas, ctx: cctx, key: null }
  }
  if (cache.key !== key) {
    if (cache.canvas.width !== W || cache.canvas.height !== H) {
      cache.canvas.width = W
      cache.canvas.height = H
    }
    editor.renderScene(cache.ctx, cam, w, h, { dpr, hideEditing: true, skipId: ss.id })
    cache.key = key
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(cache.canvas, 0, 0)
  ctx.globalCompositeOperation = 'source-over'

  ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * cam.z * dpr, cam.y * cam.z * dpr)
  const pts = live.predicted ? live.pts.concat(live.predicted) : live.pts
  const drawn = { ...shape, props: { ...shape.props, pts } }
  let inkPath
  if (live.outline && typeof Path2D !== 'undefined') {
    inkPath = new Path2D()
    traceSmooth(inkPath, live.outline.outline(pts, live.pts.length / 3 - 1), true)
    inkPath.closePath()
  }
  drawShape(ctx, drawn, { theme: editor.theme, store: editor.store, zoom: cam.z, inkPath })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return true
}
