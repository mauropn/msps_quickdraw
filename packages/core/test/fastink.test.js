// @vitest-environment jsdom
// msps: escrita rápida (fastink.js) — mesmo traço salvo, menos trabalho por movimento
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '../src/editor.js'
import { LIVE_COMMIT_MS } from '../src/fastink.js'

const ev = (x, y, over = {}) => ({
  pointerId: 3, pointerType: 'mouse', clientX: x, clientY: y, button: 0, buttons: 1, pressure: 0.5,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, timeStamp: 1,
  preventDefault() {}, stopPropagation() {}, ...over,
})

const editors = []
function mount(opts) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const editor = new Editor({ container, ...opts })
  editors.push([editor, container])
  return editor
}
afterEach(() => {
  for (const [e, c] of editors) { e.destroy(); c.remove() }
  editors.length = 0
})

// traço com caneta: alguns movimentos menores que um pixel (fundidos no último ponto)
const PATH = [[10, 10], [10.3, 10.2], [14, 12], [14.4, 12.1], [20, 18], [27, 22], [27.2, 22.5], [35, 30], [44, 31]]
function draw(editor, path = PATH, over = { pointerType: 'pen' }, beforeUp) {
  const c = editor.canvas
  editor._pointerDown({ ...ev(...path[0], over), target: c })
  path.slice(1).forEach(([x, y], i) => editor._pointerMove({ ...ev(x, y, { ...over, pressure: 0.3 + i * 0.05 }), target: c }))
  beforeUp?.()
  editor._pointerUp({ ...ev(...path.at(-1), over), target: c })
}
const inks = (editor) => editor.store.shapes().filter((s) => s.type === 'draw')

describe('fastink', () => {
  it('o traço salvo é idêntico ao do modo normal', () => {
    for (const over of [{ pointerType: 'pen' }, { pointerType: 'mouse' }]) {
      const normal = mount()
      const fast = mount({ fastInk: true })
      draw(normal, PATH, over)
      draw(fast, PATH, over)
      const [a] = inks(normal)
      const [b] = inks(fast)
      expect(b.props.pts).toEqual(a.props.pts)
      expect(b.props.done).toBe(true)
    }
  })

  it('durante o traço o store não recebe cada movimento', () => {
    const editor = mount({ fastInk: true })
    let changes = 0
    editor.store.listen(() => { changes++ })
    draw(editor, PATH, { pointerType: 'mouse' }, () => {
      // dentro do intervalo de envio: só o ponto inicial está no store
      expect(inks(editor)[0].props.pts.length).toBe(3)
      expect(editor.session.live.pts.length).toBeGreaterThan(3)
    })
    // início + fim (pontos e done), não um por movimento
    expect(changes).toBeLessThanOrEqual(3)
    expect(inks(editor)[0].props.pts.length / 3).toBe(PATH.length)
  })

  it('traço longo vai para o store de tempos em tempos', async () => {
    const editor = mount({ fastInk: true })
    const c = editor.canvas
    editor._pointerDown({ ...ev(0, 0), target: c })
    editor._pointerMove({ ...ev(5, 5), target: c })
    await new Promise((r) => setTimeout(r, LIVE_COMMIT_MS + 20))
    editor._pointerMove({ ...ev(10, 10), target: c })
    expect(inks(editor)[0].props.pts.length / 3).toBe(3)
    editor._pointerUp({ ...ev(10, 10), target: c })
  })

  it('desfazer tira o traço inteiro num passo', () => {
    const editor = mount({ fastInk: true })
    draw(editor)
    expect(inks(editor)).toHaveLength(1)
    editor.store.undo()
    expect(inks(editor)).toHaveLength(0)
  })

  it('pontos previstos ficam só na tela', () => {
    const editor = mount({ fastInk: true })
    const c = editor.canvas
    editor._pointerDown({ ...ev(0, 0), target: c })
    editor._pointerMove({ ...ev(10, 0, { getPredictedEvents: () => [ev(14, 0), ev(18, 0)] }), target: c })
    expect(editor.session.live.predicted).toHaveLength(6)
    editor._pointerUp({ ...ev(10, 0), target: c })
    expect(inks(editor)[0].props.pts.length / 3).toBe(2)
  })

  it('outra mudança no documento invalida o cache da tela; o próprio traço não', () => {
    const editor = mount({ fastInk: true })
    const c = editor.canvas
    editor._pointerDown({ ...ev(0, 0), target: c })
    const v = editor._sceneVer
    editor._pointerMove({ ...ev(10, 10), target: c })
    editor._pointerUp({ ...ev(10, 10), target: c }) // fim do traço: o cache não vale mais
    expect(editor._sceneVer).toBeGreaterThan(v)

    editor._pointerDown({ ...ev(0, 30), target: c })
    const v2 = editor._sceneVer
    editor.store.put({ id: 'remote', typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1, props: { w: 10, h: 10, geo: 'rectangle', color: 'black', size: 'm', fill: 'none', dash: 'draw' } }, 'remote')
    expect(editor._sceneVer).toBeGreaterThan(v2)
    editor._pointerUp({ ...ev(0, 30), target: c })
  })

  it('pinça no meio do traço cancela sem deixar nada', () => {
    const editor = mount({ fastInk: true })
    const c = editor.canvas
    editor._pointerDown({ ...ev(0, 0), target: c })
    editor._pointerMove({ ...ev(10, 10), target: c })
    editor._abortForPinch()
    expect(inks(editor)).toHaveLength(0)
    expect(editor.session).toBeNull()
  })

  it('diagnóstico liga e desliga', () => {
    const editor = mount()
    expect(editor.diagnostics).toBe(false)
    editor.setDiagnostics(true)
    expect(editor.diagnostics).toBe(true)
    editor.setDiagnostics(false)
    expect(editor.diagnostics).toBe(false)
  })
})
