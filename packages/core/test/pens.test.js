// @vitest-environment jsdom
// msps: canetas de escrita (pens.js)
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '../src/editor.js'
import { PEN_IDS, penInkOptions, pencilAlpha, penReach } from '../src/pens.js'
import { inkOptions } from '../src/freehand.js'
import { localBounds, drawShape } from '../src/shapes.js'
import { themeOf } from '../src/palette.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dts = readFileSync(resolve(__dirname, '../types/index.d.ts'), 'utf8')

const ev = (x, y, over = {}) => ({
  pointerId: 7, pointerType: 'mouse', clientX: x, clientY: y, button: 0, pressure: 0.5,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false,
  preventDefault() {}, stopPropagation() {}, ...over,
})

function stroke(editor, over) {
  const pts = [[10, 10], [40, 20], [80, 30]]
  editor._pointerDown({ ...ev(...pts[0], over), target: editor.canvas })
  for (const p of pts.slice(1)) editor._pointerMove({ ...ev(...p, over), target: editor.canvas })
  editor._pointerUp({ ...ev(...pts[2], over), target: editor.canvas })
  return editor.store.all().filter((r) => r.typeName === 'shape').at(-1)
}

let container, editor
function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  editor = new Editor({ container })
}
afterEach(() => { editor?.destroy(); container?.remove(); editor = null })

describe('pens', () => {
  it('traço sem caneta continua com a tinta original', () => {
    mount()
    const s = stroke(editor)
    expect(s.props.pen).toBeUndefined()
    expect(s.props.dash).toBe('draw')
  })

  it("styles.pen grava a caneta no traço (sem dash)", () => {
    mount()
    editor.setStyle('pen', 'pencil')
    const s = stroke(editor, { pointerType: 'pen', pressure: 0.8 })
    expect(s.props.pen).toBe('pencil')
    expect(s.props.isPen).toBe(true)
    expect(s.props.dash).toBeUndefined()
  })

  it('esferográfica é mais fina e quase não afina com a pressão', () => {
    const ball = penInkOptions('ballpoint', 4.6, { isPen: true })
    const ink = inkOptions(4.6, { isPen: true })
    expect(ball.size).toBeLessThan(ink.size)
    expect(ball.thinning).toBeLessThan(ink.thinning)
    expect(ball.simulatePressure).toBe(false)
    expect(penInkOptions('ballpoint', 4.6).simulatePressure).toBe(true)
  })

  it('lápis escurece com a pressão', () => {
    expect(pencilAlpha([0, 0, 0.9, 1, 1, 0.9], true)).toBeGreaterThan(pencilAlpha([0, 0, 0.2, 1, 1, 0.2], true))
    expect(pencilAlpha([0, 0, 0.9], false)).toBe(pencilAlpha([0, 0, 0.1], false))
  })

  it('limites do traço usam o alcance da caneta', () => {
    const shape = { type: 'draw', x: 0, y: 0, props: { pts: [0, 0, 0.5, 10, 0, 0.5], size: 'm', pen: 'ballpoint' } }
    expect(localBounds(shape).x).toBeCloseTo(-penReach('ballpoint', 4.6))
  })

  it('desenha sem canvas real (contexto simulado)', () => {
    const calls = []
    const ctx = new Proxy({ globalAlpha: 1 }, {
      get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return undefined }),
      set: (t, k, v) => { t[k] = v; return true },
    })
    for (const pen of PEN_IDS) {
      const shape = { type: 'draw', x: 0, y: 0, rot: 0, props: { pts: [0, 0, 0.5, 10, 5, 0.6], size: 'm', color: 'black', pen, done: true } }
      expect(() => drawShape(ctx, shape, { theme: themeOf('light') })).not.toThrow()
    }
    expect(calls).toContain('fill')
  })

  it('PenId nos tipos bate com PEN_IDS', () => {
    const m = dts.match(/export type PenId\s*=\s*([^\n]+)/)
    const ids = m[1].split('|').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort()
    expect(ids).toEqual([...PEN_IDS].sort())
  })
})
