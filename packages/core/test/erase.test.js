// @vitest-environment jsdom
// msps: borracha parcial (erase.js)
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '../src/editor.js'
import { cutInkPoints, inkPiecesToShapes, isPenEraser } from '../src/erase.js'
import { pageBounds } from '../src/shapes.js'

// traço horizontal de (0,0) a (100,0), um ponto a cada 2px
function line(over = {}) {
  const pts = []
  for (let x = 0; x <= 100; x += 2) pts.push(x, 0, 0.5)
  return { id: 'a', typeName: 'shape', type: 'draw', x: 10, y: 20, rot: 0, z: 1, props: { pts, size: 'm', color: 'black', done: true }, ...over }
}

const ev = (x, y, over = {}) => ({
  pointerId: 9, pointerType: 'mouse', clientX: x, clientY: y, button: 0, buttons: 1, pressure: 0.5,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false,
  preventDefault() {}, stopPropagation() {}, ...over,
})

let container, editor
function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  editor = new Editor({ container })
}
afterEach(() => { editor?.destroy(); container?.remove(); editor = null })

function drag(pts, over) {
  editor._pointerDown({ ...ev(...pts[0], over), target: editor.canvas })
  for (const p of pts.slice(1)) editor._pointerMove({ ...ev(...p, over), target: editor.canvas })
  editor._pointerUp({ ...ev(...pts.at(-1), over), target: editor.canvas })
}
const inks = () => editor.store.shapes().filter((s) => s.type === 'draw')

describe('erase', () => {
  it('borracha que não encosta: null', () => {
    expect(cutInkPoints(line(), { x: 60, y: 80 }, { x: 60, y: 90 }, 5)).toBeNull()
  })

  it('passar no meio parte o traço em dois', () => {
    // traço na página vai de x 10 a 110, y 20; borracha vertical em x 60
    const pieces = cutInkPoints(line(), { x: 60, y: 0 }, { x: 60, y: 40 }, 5)
    expect(pieces).toHaveLength(2)
    expect(pieces[0].at(-3)).toBeLessThan(50)
    expect(pieces[1][0]).toBeGreaterThan(50)
  })

  it('passar por cima de tudo apaga o traço inteiro', () => {
    expect(cutInkPoints(line(), { x: 0, y: 20 }, { x: 120, y: 20 }, 5)).toEqual([])
  })

  it('traço com pontos esparsos também é cortado no lugar certo', () => {
    const sparse = line({ props: { pts: [0, 0, 0.5, 100, 0, 0.5], size: 'm', color: 'black', done: true } })
    const pieces = cutInkPoints(sparse, { x: 60, y: 0 }, { x: 60, y: 40 }, 5)
    expect(pieces).toHaveLength(2)
  })

  it('traço girado vira pedaços sem rotação, no mesmo lugar da página', () => {
    const rotated = line({ rot: Math.PI / 2 })
    const before = pageBounds(rotated)
    const pieces = cutInkPoints(rotated, { x: before.x - 10, y: before.y + before.h / 2 }, { x: before.x + before.w + 10, y: before.y + before.h / 2 }, 4)
    expect(pieces).toHaveLength(2)
    const shapes = inkPiecesToShapes(rotated, pieces, () => 'n')
    expect(shapes.every((s) => s.rot === 0)).toBe(true)
    const top = pageBounds(shapes[0])
    const bottom = pageBounds(shapes[1])
    expect(Math.min(top.y, bottom.y)).toBeCloseTo(before.y, 0)
    expect(Math.max(top.y + top.h, bottom.y + bottom.h)).toBeCloseTo(before.y + before.h, 0)
  })

  it('editor parcial: corta ao vivo e desfaz num passo só', () => {
    mount()
    drag([[10, 50], [110, 50]]) // traço
    expect(inks()).toHaveLength(1)
    editor.setEraser({ mode: 'partial', size: 'm' })
    editor.setTool('eraser')
    drag([[60, 20], [60, 50], [60, 80]])
    expect(inks()).toHaveLength(2)
    editor.store.undo()
    expect(inks()).toHaveLength(1)
  })

  it("editor 'stroke' (padrão da lib) apaga o traço inteiro", () => {
    mount()
    drag([[10, 50], [110, 50]])
    editor.setTool('eraser')
    drag([[60, 40], [60, 60]])
    expect(inks()).toHaveLength(0)
  })

  it('ponta-borracha da caneta apaga mesmo com a caneta selecionada', () => {
    mount()
    drag([[10, 50], [110, 50]])
    editor.setEraser({ mode: 'partial' })
    expect(editor.tool).toBe('draw')
    drag([[60, 20], [60, 80]], { pointerType: 'pen', buttons: 32 })
    expect(inks()).toHaveLength(2)
    expect(isPenEraser({ pointerType: 'pen', buttons: 32 })).toBe(true)
    expect(isPenEraser({ pointerType: 'pen', buttons: 1 })).toBe(false)
    expect(isPenEraser({ pointerType: 'mouse', buttons: 32 })).toBe(false)
  })
})
