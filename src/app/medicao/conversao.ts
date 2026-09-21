/**
 * Utilitários para conversão entre metragem e percentual e validação de saldo.
 * Regra de negócio:
 * A porcentagem é SEMPRE relativa à quantidade total do LOCAL específico (e não da obra ou contrato).
 */

const EPSILON = 0.00001

/**
 * Converte percentual (0 a 100) em quantidade de metragem/serviço relativa à quantidade do local.
 */
export function qtyFromPercent(localQty: number, percent: number): number {
  if (localQty <= 0 || percent <= 0) return 0
  const raw = (localQty * percent) / 100
  // Arredonda para até 4 casas decimais para conformidade com numeric(12,4)
  return Math.round(raw * 10000) / 10000
}

/**
 * Converte quantidade informada em percentual relativo à quantidade do local.
 */
export function percentFromQty(localQty: number, qty: number): number {
  if (localQty <= 0 || qty <= 0) return 0
  const raw = (qty / localQty) * 100
  // Exibição e edição amigável em até 2 casas decimais
  return Math.round(raw * 100) / 100
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Valida se a quantidade solicitada é positiva e não ultrapassa o saldo disponível.
 */
export function validateQty(qty: number, balance: number): ValidationResult {
  if (qty < 0) {
    return { valid: false, error: 'A quantidade não pode ser negativa.' }
  }
  if (qty > balance + EPSILON) {
    return {
      valid: false,
      error: `A quantidade informada excede o saldo disponível (${balance.toLocaleString('pt-BR')}).`,
    }
  }
  return { valid: true }
}

/**
 * Calcula o subtotal em Reais (R$) a partir da quantidade e do preço unitário.
 */
export function calcSubtotal(qty: number, unitPrice: number): number {
  if (qty <= 0 || unitPrice <= 0) return 0
  return Math.round(qty * unitPrice * 100) / 100
}
