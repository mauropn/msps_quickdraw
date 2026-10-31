// @vitest-environment jsdom
// msps: miniatura (thumbnail.js) — a imagem em si é conferida no navegador
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '../src/editor.js'
import { renderThumbnail } from '../src/thumbnail.js'

let editor, container
afterEach(() => { editor?.destroy(); container?.remove() })

describe('thumbnail', () => {
  it('quadro vazio: sem miniatura', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    editor = new Editor({ container })
    expect(renderThumbnail(editor)).toBeNull()
  })

  it('gera uma imagem e o tema do editor volta ao que era', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    editor = new Editor({ container, theme: 'dark' })
    editor.store.put({ id: 'a', typeName: 'shape', type: 'draw', x: 0, y: 0, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 10, 10, 0.5], color: 'black', size: 'm', done: true } })
    const before = editor.theme
    expect(renderThumbnail(editor)).toMatch(/^data:image\/(webp|jpeg);base64,/)
    expect(editor.theme).toBe(before)
  })
})
