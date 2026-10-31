// msps: contorno incremental (liveink.js) = strokeOutline, número a número
import { describe, it, expect } from 'vitest'
import { createLiveOutline } from '../src/liveink.js'
import { strokeOutline, inkOptions } from '../src/freehand.js'
import { penInkOptions } from '../src/pens.js'

function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// traço de mão: anda, curva, às vezes volta (cantos), às vezes para
function stroke(seed, n) {
  const r = rng(seed)
  const pts = [0, 0, 0.5]
  let x = 0, y = 0, a = r() * 6.28
  for (let i = 1; i < n; i++) {
    a += (r() - 0.5) * (r() < 0.05 ? 4 : 0.6)
    const step = r() < 0.1 ? 0 : r() * 6
    x += Math.cos(a) * step
    y += Math.sin(a) * step
    pts.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(r() * 100) / 100)
  }
  return pts
}

const OPTIONS = {
  'pressão da caneta': inkOptions(8, { isPen: true }),
  'pressão simulada': inkOptions(8, { isPen: false }),
  esferográfica: penInkOptions('ballpoint', 8, { isPen: true }),
  lápis: penInkOptions('pencil', 8, { isPen: false }),
}

describe('liveink', () => {
  for (const [name, options] of Object.entries(OPTIONS)) {
    it(`igual ao contorno completo a cada ponto (${name})`, () => {
      for (const seed of [1, 2, 3, 7, 42]) {
        const all = stroke(seed, 260)
        const live = createLiveOutline(options)
        for (let n = 1; n <= all.length / 3; n++) {
          const pts = all.slice(0, n * 3)
          expect(live.outline(pts)).toEqual(strokeOutline(pts, options))
        }
      }
    })
  }

  it('o último ponto pode mudar (a caneta funde movimentos pequenos nele)', () => {
    const options = OPTIONS['pressão da caneta']
    const all = stroke(5, 200)
    const live = createLiveOutline(options)
    for (let n = 2; n <= all.length / 3; n++) {
      const pts = all.slice(0, n * 3)
      // primeiro uma versão do último ponto "a caminho", depois a final
      const moving = pts.slice()
      moving[moving.length - 3] -= 0.4
      moving[moving.length - 1] = 0.9
      expect(live.outline(moving)).toEqual(strokeOutline(moving, options))
      expect(live.outline(pts)).toEqual(strokeOutline(pts, options))
    }
  })

  it('pontos previstos entram e saem sem estragar o que é estável', () => {
    const options = OPTIONS.esferográfica
    const all = stroke(9, 220)
    const live = createLiveOutline(options)
    for (let n = 2; n <= all.length / 3 - 3; n++) {
      const real = all.slice(0, n * 3)
      const predicted = real.concat([real.at(-3) + 3, real.at(-2) + 1, 0.5, real.at(-3) + 6, real.at(-2) + 2, 0.5])
      expect(live.outline(predicted, n - 1)).toEqual(strokeOutline(predicted, options))
      expect(live.outline(real)).toEqual(strokeOutline(real, options))
    }
  })

  it('traço terminado (last) e afinado nas pontas usam o cálculo completo', () => {
    const pts = stroke(3, 80)
    const done = inkOptions(8, { isPen: true, done: true })
    expect(createLiveOutline(done).outline(pts)).toEqual(strokeOutline(pts, done))
    const tapered = { ...OPTIONS['pressão da caneta'], start: { taper: 20 } }
    expect(createLiveOutline(tapered).outline(pts)).toEqual(strokeOutline(pts, tapered))
  })
})
