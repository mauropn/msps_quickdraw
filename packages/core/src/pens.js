// msps: canetas de escrita — esferográfica e lápis.
// Um traço 'draw' com `props.pen` usa a tinta da caneta; sem `pen`, a tinta
// original do Quickdraw (traços antigos não mudam de aparência).
// Dependency-free ESM (see palette.js).

export const PEN_IDS = ['ballpoint', 'pencil']

const easeOutSine = (t) => Math.sin((t * Math.PI) / 2)
const linear = (t) => t

// Esferográfica: linha fina e firme; a pressão mexe pouco na largura, e a
// ponta acompanha a caneta de perto (pouco streamline = sem "atraso").
// Lápis: mais largo e mais sensível à pressão; o grafite fica no papel com
// grão e fica mais escuro quanto mais força.
const PENS = {
  ballpoint: {
    scale: 0.55,
    pen: { thinning: 0.22, smoothing: 0.55, streamline: 0.4, easing: linear },
    mouse: { thinning: 0.12, smoothing: 0.55, streamline: 0.45, easing: linear },
  },
  pencil: {
    scale: 0.7,
    pen: { thinning: 0.45, smoothing: 0.5, streamline: 0.4, easing: easeOutSine },
    mouse: { thinning: 0.3, smoothing: 0.5, streamline: 0.45, easing: easeOutSine },
  },
}

export const isPenId = (id) => PEN_IDS.includes(id)

/** Opções de tinta (perfect-freehand) da caneta para um traço `width` de largura nominal. */
export function penInkOptions(pen, width, { isPen = false, done = false } = {}) {
  const def = PENS[pen] || PENS.ballpoint
  const o = isPen ? def.pen : def.mouse
  return {
    size: width * def.scale,
    thinning: o.thinning,
    smoothing: o.smoothing,
    streamline: o.streamline,
    easing: o.easing,
    simulatePressure: !isPen,
    last: done,
  }
}

/** Quanto a tinta passa da linha central (para os limites do traço). */
export const penReach = (pen, width) => width * (PENS[pen] || PENS.ballpoint).scale + 1

// ---- lápis ------------------------------------------------------------------

/**
 * Opacidade do grafite: média da pressão do traço (caneta de verdade) —
 * leve = cinza claro, forte = escuro. Mouse/dedo ficam num meio-termo.
 */
export function pencilAlpha(pts, isPen) {
  if (!isPen) return 0.78
  let sum = 0
  let n = 0
  for (let i = 2; i < pts.length; i += 3) { sum += pts[i]; n++ }
  const p = n ? sum / n : 0.5
  return Math.min(0.95, 0.5 + p * 0.5)
}

const GRAIN_SIZE = 64
let grainTile // canvas de alfa (só o grão), compartilhado por todas as cores
const grainPatterns = new Map() // cor → { canvas }

// gerador determinístico: o grão é o mesmo a cada redesenho (não "ferve")
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    return c
  }
  return null
}

function buildGrainTile() {
  const c = makeCanvas(GRAIN_SIZE, GRAIN_SIZE)
  const g = c?.getContext?.('2d')
  if (!g?.createImageData) return null
  const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE)
  const rnd = mulberry32(0x9e3779b9)
  for (let i = 0; i < img.data.length; i += 4) {
    // maioria do grafite cobre; alguns pontos do papel "aparecem"
    const r = rnd()
    const a = r < 0.12 ? 0.15 + rnd() * 0.25 : 0.7 + rnd() * 0.3
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0
    img.data[i + 3] = Math.round(a * 255)
  }
  g.putImageData(img, 0, 0)
  return c
}

/** Canvas do grão na cor dada, ou null onde não há canvas (testes). */
function grainCanvas(color) {
  const hit = grainPatterns.get(color)
  if (hit !== undefined) return hit
  if (grainTile === undefined) grainTile = buildGrainTile()
  let out = null
  if (grainTile) {
    const c = makeCanvas(GRAIN_SIZE, GRAIN_SIZE)
    const g = c.getContext('2d')
    g.drawImage(grainTile, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, GRAIN_SIZE, GRAIN_SIZE)
    out = c
  }
  grainPatterns.set(color, out)
  return out
}

/**
 * Preenche o contorno com a tinta da caneta. `ctx` está no espaço do traço.
 * O grão do lápis fica em pixels da tela (nítido em qualquer zoom) e preso
 * à origem do traço, então não "escorrega" ao mover a câmera.
 */
export function fillPen(ctx, path, pen, color, props) {
  if (pen !== 'pencil') {
    ctx.fillStyle = color
    ctx.fill(path)
    return
  }
  ctx.globalAlpha *= pencilAlpha(props.pts, !!props.isPen)
  const grain = grainCanvas(color)
  const pattern = grain && ctx.createPattern?.(grain, 'repeat')
  if (pattern && pattern.setTransform && ctx.getTransform && typeof DOMMatrix !== 'undefined') {
    const m = ctx.getTransform()
    const s = Math.hypot(m.a, m.b) || 1
    pattern.setTransform(new DOMMatrix().scaleSelf(1 / s, 1 / s))
  }
  ctx.fillStyle = pattern || color
  ctx.fill(path)
}
