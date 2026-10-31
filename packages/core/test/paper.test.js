// msps: papel de caderno (paper.js)
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  PAPER_SPACINGS, PAPER_SPACING_IDS, PAPER_MARGIN_X, normalizePaper, paperRuleRows,
} from '../src/paper.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dts = readFileSync(resolve(__dirname, '../types/index.d.ts'), 'utf8')

describe('paper', () => {
  it('normalizePaper: null fica null; padrões são medium + margem', () => {
    expect(normalizePaper(null)).toBeNull()
    expect(normalizePaper(undefined)).toBeNull()
    expect(normalizePaper({})).toEqual({ lines: 'medium', margin: true, marginX: PAPER_MARGIN_X })
    expect(normalizePaper({ lines: 'nope', margin: false })).toEqual({ lines: 'medium', margin: false, marginX: PAPER_MARGIN_X })
    expect(normalizePaper({ lines: 'none' }).lines).toBe('none')
  })

  it('pautas ficam presas ao papel: o espaçamento escala com o zoom', () => {
    const at = (z) => {
      const rows = paperRuleRows({ lines: 'medium' }, { x: 0, y: 0, z }, 400, 1)
      return rows[1].y - rows[0].y
    }
    expect(at(1)).toBeCloseTo(PAPER_SPACINGS.medium)
    expect(at(2)).toBeCloseTo(PAPER_SPACINGS.medium * 2)
  })

  it('pautas acompanham a câmera (pan)', () => {
    const rows = paperRuleRows({ lines: 'narrow' }, { x: 0, y: -10, z: 1 }, 200, 1)
    // primeira pauta visível: y de papel 24 → tela 14
    expect(rows[0].y).toBeCloseTo(PAPER_SPACINGS.narrow - 10)
  })

  it('zoom muito pequeno desbasta as pautas (sem ruído)', () => {
    const rows = paperRuleRows({ lines: 'narrow' }, { x: 0, y: 0, z: 0.05 }, 1000, 1)
    const full = rows.filter((r) => r.alpha === 1)
    expect(full[1].y - full[0].y).toBeGreaterThanOrEqual(7)
  })

  it("lines 'none' não desenha pautas", () => {
    expect(paperRuleRows({ lines: 'none' }, { x: 0, y: 0, z: 1 }, 400, 1)).toEqual([])
  })

  it('PaperSpacingId nos tipos bate com PAPER_SPACING_IDS', () => {
    const m = dts.match(/export type PaperSpacingId\s*=\s*([^\n]+)/)
    const ids = m[1].split('|').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort()
    expect(ids).toEqual([...PAPER_SPACING_IDS].sort())
  })
})
