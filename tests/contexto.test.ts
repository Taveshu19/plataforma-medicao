import { describe, it, expect } from 'vitest'
import { formatarReais, competenciaPorExtenso } from '../src/app/formato'

function normalizarEspaco(s: string) {
  return s.replace(/\u00a0/g, ' ')
}

describe('formatacao de dinheiro', () => {
  it('formata em reais com duas casas', () => {
    expect(normalizarEspaco(formatarReais(850000))).toBe('R$ 850.000,00')
  })

  it('formata zero', () => {
    expect(normalizarEspaco(formatarReais(0))).toBe('R$ 0,00')
  })

  it('formata centavos', () => {
    expect(normalizarEspaco(formatarReais(2240.5))).toBe('R$ 2.240,50')
  })
})

describe('competencia por extenso', () => {
  it('traduz a data da competencia para mes e ano', () => {
    expect(competenciaPorExtenso('2026-09-01')).toBe('Setembro/2026')
  })

  it('funciona em dezembro', () => {
    expect(competenciaPorExtenso('2026-12-01')).toBe('Dezembro/2026')
  })
})
