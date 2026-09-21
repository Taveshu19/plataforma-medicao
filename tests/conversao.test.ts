import { describe, it, expect } from 'vitest'
import {
  qtyFromPercent,
  percentFromQty,
  validateQty,
  calcSubtotal,
} from '../src/app/medicao/conversao'

describe('conversao e validacao de quantidades de medicao', () => {
  describe('qtyFromPercent', () => {
    it('calcula metragem a partir de 100%', () => {
      expect(qtyFromPercent(120, 100)).toBe(120)
    })

    it('calcula metragem a partir de 50%', () => {
      expect(qtyFromPercent(120, 50)).toBe(60)
    })

    it('calcula metragem a partir de 25.5%', () => {
      expect(qtyFromPercent(120, 25.5)).toBe(30.6)
    })

    it('retorna 0 para porcentagem zero ou negativa', () => {
      expect(qtyFromPercent(120, 0)).toBe(0)
      expect(qtyFromPercent(120, -10)).toBe(0)
    })

    it('retorna 0 se a quantidade do local for zero ou negativa', () => {
      expect(qtyFromPercent(0, 50)).toBe(0)
      expect(qtyFromPercent(-10, 50)).toBe(0)
    })
  })

  describe('percentFromQty', () => {
    it('calcula 100% quando a quantidade solicitada for igual ao total do local', () => {
      expect(percentFromQty(120, 120)).toBe(100)
    })

    it('calcula 50% quando for metade', () => {
      expect(percentFromQty(120, 60)).toBe(50)
    })

    it('calcula percentual fracionado com 2 casas decimais', () => {
      // 30.6 / 120 * 100 = 25.5
      expect(percentFromQty(120, 30.6)).toBe(25.5)
      // 1 / 3 * 100 = 33.3333... -> 33.33
      expect(percentFromQty(3, 1)).toBe(33.33)
    })

    it('retorna 0 quando a quantidade do local for zero', () => {
      expect(percentFromQty(0, 10)).toBe(0)
    })

    it('retorna 0 quando a quantidade informada for zero ou negativa', () => {
      expect(percentFromQty(120, 0)).toBe(0)
      expect(percentFromQty(120, -5)).toBe(0)
    })
  })

  describe('validateQty', () => {
    it('aceita quantidade menor ou igual ao saldo', () => {
      expect(validateQty(50, 100)).toEqual({ valid: true })
      expect(validateQty(100, 100)).toEqual({ valid: true })
      expect(validateQty(0, 100)).toEqual({ valid: true })
    })

    it('rejeita quantidade negativa', () => {
      const res = validateQty(-1, 100)
      expect(res.valid).toBe(false)
      expect(res.error).toBe('A quantidade não pode ser negativa.')
    })

    it('rejeita quantidade maior que o saldo', () => {
      const res = validateQty(101, 100)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('excede o saldo disponível')
    })

    it('aceita pequenas diferencas decorrentes de arredondamento de float', () => {
      // ex: saldo 10.0001 e informado 10.0001
      expect(validateQty(10.0001, 10.0001)).toEqual({ valid: true })
    })
  })

  describe('calcSubtotal', () => {
    it('calcula o valor monetário arredondado em 2 casas decimais', () => {
      expect(calcSubtotal(10, 25.5)).toBe(255)
      expect(calcSubtotal(3.33, 15.75)).toBe(52.45)
    })

    it('retorna 0 para quantidade zero ou negativa', () => {
      expect(calcSubtotal(0, 50)).toBe(0)
      expect(calcSubtotal(-5, 50)).toBe(0)
    })
  })
})
