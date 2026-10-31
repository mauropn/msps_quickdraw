// msps: papel de caderno. Diferente das grades da lib (que se adaptam ao zoom e
// fazem as linhas surgirem/sumirem), aqui as pautas ficam presas ao PAPEL: a
// escrita e as linhas ampliam juntas, como numa folha de verdade. Opcionalmente
// uma margem vertical (vermelha) à esquerda, do topo ao rodapé.
// Dependency-free ESM (see palette.js).

/** Espaçamentos das pautas, em px do papel (zoom 1). 'wide' = o 'ruled' original. */
export const PAPER_SPACINGS = { narrow: 24, medium: 30, wide: 40 }

export const PAPER_SPACING_IDS = ['narrow', 'medium', 'wide']

/** Posição padrão da margem, em px do papel. */
export const PAPER_MARGIN_X = 64

export const PAPER_MARGIN_COLORS = { light: 'rgba(229, 72, 77, 0.75)', dark: 'rgba(255, 110, 110, 0.6)' }

// abaixo disso (px de tela) as pautas viram ruído: desenha uma a cada 2, 4, ...
const MIN_SCREEN_GAP = 7

/**
 * Normaliza a configuração do papel (null = sem papel de caderno, vale a grade da lib).
 * paper: { lines?: 'none'|'narrow'|'medium'|'wide', margin?: boolean, marginX?: number }
 */
export function normalizePaper(paper) {
  if (!paper || typeof paper !== 'object') return null
  const lines = paper.lines === 'none' || PAPER_SPACING_IDS.includes(paper.lines) ? paper.lines : 'medium'
  const margin = paper.margin !== false
  const marginX = Number.isFinite(paper.marginX) ? paper.marginX : PAPER_MARGIN_X
  return { lines, margin, marginX }
}

/** Pautas visíveis em px de dispositivo: [{ y, alpha }], já com o desbaste de zoom aplicado. */
export function paperRuleRows(paper, cam, H, dpr) {
  const p = normalizePaper(paper)
  if (!p || p.lines === 'none' || !(cam.z > 0)) return []
  const spacing = PAPER_SPACINGS[p.lines]
  const z = cam.z * dpr
  // longe demais: pula pautas em potências de 2, com a do meio esmaecendo (sem "pulos")
  let every = 1
  while (spacing * every * cam.z < MIN_SCREEN_GAP) every *= 2
  const gap = spacing * every * cam.z
  const fade = every > 1 ? Math.min(1, Math.max(0, gap / MIN_SCREEN_GAP - 1)) : 1
  const step = spacing * every
  const rows = []
  const k0 = Math.ceil(-cam.y / step)
  for (let k = k0, y = (k0 * step + cam.y) * z; y <= H; k++, y += step * z) {
    rows.push({ y, alpha: 1 })
    // a pauta intermediária do nível anterior, sumindo aos poucos
    if (every > 1 && fade > 0) rows.push({ y: y + (step / 2) * z, alpha: fade })
  }
  return rows
}

/**
 * Desenha o papel no ctx SEM transformação (px de dispositivo), como o _drawGrid.
 * W/H em px de dispositivo.
 */
export function drawPaper(ctx, cam, W, H, dpr, paper, theme) {
  const p = normalizePaper(paper)
  if (!p) return
  ctx.save()
  const rows = paperRuleRows(p, cam, H, dpr)
  if (rows.length) {
    ctx.strokeStyle = theme.grid?.line?.minor ?? 'rgba(0,0,0,0.3)'
    ctx.lineWidth = Math.max(1, Math.round(dpr))
    // dois traçados: pautas cheias e as intermediárias esmaecendo (todas com o mesmo alpha)
    const fadeAlpha = rows.find((r) => r.alpha !== 1)?.alpha
    for (const alpha of fadeAlpha ? [1, fadeAlpha] : [1]) {
      ctx.globalAlpha = alpha
      ctx.beginPath()
      for (const r of rows) {
        if (r.alpha !== alpha) continue
        // meio pixel: a pauta de 1px fica num pixel só, nítida
        const y = Math.round(r.y) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  if (p.margin) {
    const x = Math.round((p.marginX + cam.x) * cam.z * dpr) + 0.5
    if (x >= 0 && x <= W) {
      ctx.strokeStyle = PAPER_MARGIN_COLORS[theme.id === 'dark' ? 'dark' : 'light']
      ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr))
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
  }
  ctx.restore()
}
