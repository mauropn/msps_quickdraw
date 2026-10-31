// msps: contorno incremental do traço em andamento.
//
// strokeOutline (freehand.js) refaz o traço inteiro a cada ponto novo: num
// traço longo, isso cresce com o tamanho dele a cada quadro. Aqui o mesmo
// algoritmo (perfect-freehand, MIT — ver freehand.js) roda em partes: o que
// já não pode mudar fica guardado (pontos suavizados, lados esquerdo/direito e
// o estado do laço) e cada quadro processa só a ponta. O resultado é IGUAL ao
// de strokeOutline com as mesmas opções — os testes comparam número a número.
//
// O que pode mudar e por isso nunca é guardado:
// - o último ponto cru (a caneta funde movimentos menores que 1px nele);
// - pontos previstos (getPredictedEvents), passados como `mutableFrom`;
// - os pontos a menos de END_NOISE_THRESHOLD do fim (o algoritmo os descarta);
// - os 10 primeiros, que dão a pressão inicial.

import { strokeOutline } from './freehand.js'

const { PI, min } = Math

const RATE_OF_PRESSURE_CHANGE = 0.275
const FIXED_PI = PI + 0.0001
const START_CAP_SEGMENTS = 13
const END_CAP_SEGMENTS = 29
const CORNER_CAP_SEGMENTS = 13
const END_NOISE_THRESHOLD = 3
const MIN_STREAMLINE_T = 0.15
const STREAMLINE_T_RANGE = 0.85
const MIN_RADIUS = 0.01
const DEFAULT_FIRST_PRESSURE = 0.25
const DEFAULT_PRESSURE = 0.5
const UNIT_OFFSET = [1, 1]
// abaixo disso refazer tudo é barato e evita os casos especiais do início
const MIN_INCREMENTAL = 12

const getStrokeRadius = (size, thinning, pressure, easing) => size * easing(0.5 - thinning * (0.5 - pressure))
function simulatePressure(prevPressure, distance, size) {
  const sp = min(1, distance / size)
  const rp = min(1, 1 - sp)
  return min(1, prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE))
}
const neg = (a) => [-a[0], -a[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, n) => [a[0] * n, a[1] * n]
const per = (a) => [a[1], -a[0]]
const dpr = (a, b) => a[0] * b[0] + a[1] * b[1]
const isEqual = (a, b) => a[0] === b[0] && a[1] === b[1]
const len = (a) => Math.hypot(a[0], a[1])
const uni = (a) => { const l = len(a); return l === 0 ? [0, 0] : [a[0] / l, a[1] / l] }
const dist = (a, b) => Math.hypot(a[1] - b[1], a[0] - b[0])
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
const lrp = (a, b, t) => add(a, mul(sub(b, a), t))
const prj = (a, b, c) => add(a, mul(b, c))
function rotAround(a, c, r) {
  const s = Math.sin(r), co = Math.cos(r)
  const px = a[0] - c[0], py = a[1] - c[1]
  return [px * co - py * s + c[0], px * s + py * co + c[1]]
}
const isValidPressure = (p) => p != null && p >= 0

/**
 * Contorno de um traço que cresce. `options` são as de strokeOutline e não
 * mudam durante o traço; `last: true` (traço terminado) não usa o modo
 * incremental. Cada instância acompanha UM traço: os pontos já vistos não
 * podem mudar, exceto o último e os a partir de `mutableFrom`.
 */
export function createLiveOutline(options = {}) {
  const {
    streamline = 0.5, size = 16, smoothing = 0.5, thinning = 0.5,
    simulatePressure: shouldSimulatePressure = true, easing = (t) => t,
    start = {}, end = {}, last: isComplete = false,
  } = options
  const t = MIN_STREAMLINE_T + (1 - streamline) * STREAMLINE_T_RANGE
  const minDistance = Math.pow(size * smoothing, 2)
  const capStart = start.cap ?? true
  const capEnd = end.cap ?? true
  // afinamento nas pontas depende do comprimento total: sem modo incremental
  const tapered = !!(start.taper || end.taper)

  // pontos suavizados estáveis (getStrokePoints) e o estado para continuar
  const sp = []
  let spRaw = 0 // pontos crus já transformados em `sp`
  let spPrev = null
  // comprimento corrido e espera do comprimento mínimo, como em getStrokePoints
  const spState = { running: 0, reached: false }

  // lados estáveis do contorno (getStrokeOutlinePoints) e o estado do laço
  const left = []
  const right = []
  let loop = null // { i, prevPressure, radius, firstRadius, prevVector, prevLeftPoint, prevRightPoint, tempLeftPoint, tempRightPoint, isPrevPointSharpCorner }

  const raw = (pts, i) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]

  // o mesmo passo de getStrokePoints para um ponto cru; `isMax`: é o último
  // (esse não espera o comprimento mínimo). `state` avança mesmo quando o
  // ponto é descartado, como no original.
  function spStep(prev, state, p, isMax) {
    const point = lrp(prev.point, p, t)
    if (isEqual(prev.point, point)) return null
    const distance = dist(point, prev.point)
    state.running += distance
    if (!isMax && !state.reached) {
      if (state.running < size) return null
      state.reached = true
    }
    return {
      point,
      pressure: isValidPressure(p[2]) ? p[2] : DEFAULT_PRESSURE,
      vector: uni(sub(prev.point, point)),
      distance,
      runningLength: state.running,
    }
  }

  // o mesmo passo do laço de getStrokeOutlinePoints para o índice i
  function outlineStep(st, points, i, totalLength, outLeft, outRight) {
    let { pressure } = points[i]
    const { point, vector, distance, runningLength } = points[i]
    const isLastPoint = i === points.length - 1
    if (!isLastPoint && totalLength - runningLength < END_NOISE_THRESHOLD) return
    if (thinning) {
      if (shouldSimulatePressure) pressure = simulatePressure(st.prevPressure, distance, size)
      st.radius = getStrokeRadius(size, thinning, pressure, easing)
    } else {
      st.radius = size / 2
    }
    if (st.firstRadius === undefined) st.firstRadius = st.radius
    st.radius = Math.max(MIN_RADIUS, st.radius)

    const nextVector = (!isLastPoint ? points[i + 1] : points[i]).vector
    const nextDpr = !isLastPoint ? dpr(vector, nextVector) : 1.0
    const prevDpr = dpr(vector, st.prevVector)
    const isPointSharpCorner = prevDpr < 0 && !st.isPrevPointSharpCorner
    const isNextPointSharpCorner = nextDpr !== null && nextDpr < 0

    if (isPointSharpCorner || isNextPointSharpCorner) {
      const offset = mul(per(st.prevVector), st.radius)
      const step = 1 / CORNER_CAP_SEGMENTS
      for (let k = 0; k <= 1; k += step) {
        st.tempLeftPoint = rotAround(sub(point, offset), point, FIXED_PI * k)
        outLeft.push(st.tempLeftPoint)
        st.tempRightPoint = rotAround(add(point, offset), point, FIXED_PI * -k)
        outRight.push(st.tempRightPoint)
      }
      st.prevLeftPoint = st.tempLeftPoint
      st.prevRightPoint = st.tempRightPoint
      if (isNextPointSharpCorner) st.isPrevPointSharpCorner = true
      return
    }
    st.isPrevPointSharpCorner = false

    if (isLastPoint) {
      const offset = mul(per(vector), st.radius)
      outLeft.push(sub(point, offset))
      outRight.push(add(point, offset))
      return
    }

    const offset = mul(per(lrp(nextVector, vector, nextDpr)), st.radius)
    st.tempLeftPoint = sub(point, offset)
    if (i <= 1 || dist2(st.prevLeftPoint, st.tempLeftPoint) > minDistance) {
      outLeft.push(st.tempLeftPoint)
      st.prevLeftPoint = st.tempLeftPoint
    }
    st.tempRightPoint = add(point, offset)
    if (i <= 1 || dist2(st.prevRightPoint, st.tempRightPoint) > minDistance) {
      outRight.push(st.tempRightPoint)
      st.prevRightPoint = st.tempRightPoint
    }
    st.prevPressure = pressure
    st.prevVector = vector
  }

  /**
   * Contorno (flat [x, y, ...]) dos pontos crus `pts` (flat [x, y, z, ...]).
   * `mutableFrom`: primeiro ponto cru que ainda pode mudar (padrão: o último).
   */
  function outline(pts, mutableFrom) {
    const n = Math.floor(pts.length / 3)
    if (isComplete || tapered || n < MIN_INCREMENTAL) return strokeOutline(pts, options)
    const stableRaw = Math.min(n - 1, mutableFrom ?? n - 1)

    // 1) pontos suavizados: os estáveis viram parte de `sp` de vez
    if (!spPrev) {
      const p0 = raw(pts, 0)
      spPrev = {
        point: [p0[0], p0[1]],
        pressure: isValidPressure(p0[2]) ? p0[2] : DEFAULT_FIRST_PRESSURE,
        vector: [...UNIT_OFFSET],
        distance: 0,
        runningLength: 0,
      }
      sp.push(spPrev)
      spRaw = 1
    }
    for (; spRaw < stableRaw; spRaw++) {
      const next = spStep(spPrev, spState, raw(pts, spRaw), false)
      if (!next) continue
      sp.push(next)
      spPrev = next
    }
    // a ponta (o que ainda pode mudar), sem mexer no que é estável
    const tail = []
    const tailState = { ...spState }
    let prev = spPrev
    for (let i = stableRaw; i < n; i++) {
      const next = spStep(prev, tailState, raw(pts, i), i === n - 1)
      if (!next) continue
      tail.push(next)
      prev = next
    }
    // a pressão inicial vem dos 10 primeiros: só com eles já estáveis
    if (sp.length < MIN_INCREMENTAL) return strokeOutline(pts, options)
    const points = tail.length ? sp.concat(tail) : sp
    // getStrokePoints dá ao primeiro ponto o vetor do segundo (estável aqui)
    sp[0].vector = sp[1].vector
    const totalLength = points[points.length - 1].runningLength

    // 2) lados do contorno: avança o estado guardado até onde é definitivo —
    // o ponto e o seguinte estáveis, e longe do fim mesmo que a ponta encolha
    if (!loop) {
      const prevPressure = sp.slice(0, 10).reduce((acc, curr) => {
        let pressure = curr.pressure
        if (shouldSimulatePressure) pressure = simulatePressure(acc, curr.distance, size)
        return (acc + pressure) / 2
      }, sp[0].pressure)
      loop = {
        i: 0, prevPressure, radius: 0, firstRadius: undefined,
        prevVector: sp[0].vector, prevLeftPoint: sp[0].point, prevRightPoint: sp[0].point,
        tempLeftPoint: sp[0].point, tempRightPoint: sp[0].point, isPrevPointSharpCorner: false,
      }
    }
    const stableLength = sp[sp.length - 1].runningLength
    for (; loop.i < sp.length - 1; loop.i++) {
      if (stableLength - sp[loop.i].runningLength < END_NOISE_THRESHOLD) break
      outlineStep(loop, points, loop.i, totalLength, left, right)
    }

    // 3) o resto, numa cópia do estado
    const st = { ...loop }
    const tailLeft = []
    const tailRight = []
    for (let i = loop.i; i < points.length; i++) outlineStep(st, points, i, totalLength, tailLeft, tailRight)

    const firstPoint = [points[0].point[0], points[0].point[1]]
    const lastPoint = [points[points.length - 1].point[0], points[points.length - 1].point[1]]
    const rightFirst = right.length ? right[0] : tailRight[0]
    const startCap = []
    const endCap = []
    if (capStart) {
      const step = 1 / START_CAP_SEGMENTS
      for (let k = step; k <= 1; k += step) startCap.push(rotAround(rightFirst, firstPoint, FIXED_PI * k))
    } else {
      const leftFirst = left.length ? left[0] : tailLeft[0]
      const corners = sub(leftFirst, rightFirst)
      const a = mul(corners, 0.5), b = mul(corners, 0.51)
      startCap.push(sub(firstPoint, a), sub(firstPoint, b), add(firstPoint, b), add(firstPoint, a))
    }
    const direction = per(neg(points[points.length - 1].vector))
    if (capEnd) {
      const s = prj(lastPoint, direction, st.radius)
      const step = 1 / END_CAP_SEGMENTS
      for (let k = step; k < 1; k += step) endCap.push(rotAround(s, lastPoint, FIXED_PI * 3 * k))
    } else {
      endCap.push(
        add(lastPoint, mul(direction, st.radius)),
        add(lastPoint, mul(direction, st.radius * 0.99)),
        sub(lastPoint, mul(direction, st.radius * 0.99)),
        sub(lastPoint, mul(direction, st.radius)),
      )
    }

    // leftPts.concat(endCap, rightPts.reverse(), startCap), já achatado
    const total = left.length + tailLeft.length + endCap.length + tailRight.length + right.length + startCap.length
    const out = new Array(total * 2)
    let o = 0
    const put = (q) => { out[o++] = q[0]; out[o++] = q[1] }
    for (const q of left) put(q)
    for (const q of tailLeft) put(q)
    for (const q of endCap) put(q)
    for (let k = tailRight.length - 1; k >= 0; k--) put(tailRight[k])
    for (let k = right.length - 1; k >= 0; k--) put(right[k])
    for (const q of startCap) put(q)
    return out
  }

  /** Quanto já está guardado (diagnóstico): pontos suavizados e pontos do contorno. */
  const stats = () => ({ stable: sp.length, outline: loop ? loop.i : 0 })

  return { outline, stats }
}
