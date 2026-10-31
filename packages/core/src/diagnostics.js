// msps: painel de diagnóstico do quadro (editor.setDiagnostics(true)).
// Mostra, no canto da tela: quadros por segundo, quanto tempo o último quadro
// levou para desenhar, o tempo do movimento da caneta até o quadro desenhado
// e o tamanho do traço/documento. Serve para medir antes e depois — fica
// desligado por padrão e não muda nada no desenho.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function createDiagnostics() {
  return { frames: [], frameMs: 0, latency: 0, latencyMax: 0, pendingInput: 0 }
}

/** Um movimento chegou; a latência conta do mais antigo ainda não desenhado. */
export function diagInput(d, e) {
  if (!d.pendingInput) d.pendingInput = e?.timeStamp > 0 ? e.timeStamp : now()
}

/** Um quadro foi desenhado entre `start` e `end` (performance.now()). */
export function diagFrame(d, start, end) {
  d.frames.push(end)
  while (d.frames.length && end - d.frames[0] > 1000) d.frames.shift()
  // média móvel: o número não pula a cada quadro
  d.frameMs = d.frameMs ? d.frameMs * 0.8 + (end - start) * 0.2 : end - start
  if (d.pendingInput) {
    const lat = end - d.pendingInput
    d.pendingInput = 0
    if (lat >= 0 && lat < 2000) {
      d.latency = d.latency ? d.latency * 0.8 + lat * 0.2 : lat
      d.latencyMax = Math.max(d.latencyMax * 0.995, lat)
    }
  }
}

/** Desenha o painel no overlay (contexto sem transformação, `dpr` da tela). */
export function drawDiagnostics(ctx, d, editor, dpr) {
  const live = editor.session?.live
  const lines = [
    `${d.frames.length} quadros/s · quadro ${d.frameMs.toFixed(1)} ms`,
    `caneta→quadro ${d.latency.toFixed(0)} ms (pico ${d.latencyMax.toFixed(0)})`,
    `${editor.store.size} itens${live ? ` · traço ${Math.floor(live.pts.length / 3)} pts` : ''}`,
    `rápido ${editor.fastInk ? 'ligado' : 'desligado'} · baixa latência ${editor.lowLatency ? 'ligada' : 'desligada'}`,
  ]
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
  const h = lines.length * 15 + 10
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.fillRect(8, 8, w, h)
  ctx.fillStyle = '#e2e8f0'
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, 16, 14 + i * 15))
  ctx.restore()
}
