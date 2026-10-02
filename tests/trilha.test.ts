import { describe, it, expect } from 'vitest'
import { montarTrilha, type NivelAprovacao } from '../src/app/trilha'

const NIVEIS: NivelAprovacao[] = [
  { level: 1, label: 'Engenharia' },
  { level: 2, label: 'Coordenação' },
  { level: 3, label: 'Gerência' },
]

function progresso(status: string, currentLevel = 0, dataPrevistaPagamento: string | null = null) {
  return { status, currentLevel, protocolo: 'MED-2026-09-001', dataPrevistaPagamento }
}

function estados(passos: { estado: string }[]) {
  return passos.map((p) => p.estado)
}

describe('trilha de status da medição', () => {
  it('sem medição nenhuma, só o primeiro passo está ativo', () => {
    const t = montarTrilha(null, NIVEIS)
    expect(t[0].rotulo).toBe('Criar medição')
    expect(t[0].estado).toBe('atual')
    expect(estados(t).slice(1).every((e) => e === 'pendente')).toBe(true)
  })

  it('a quantidade de passos acompanha os níveis configurados', () => {
    // envio + N níveis + liberado + NF + pagamento
    expect(montarTrilha(null, NIVEIS)).toHaveLength(3 + 4)
    expect(montarTrilha(null, [{ level: 1, label: 'Engenharia' }])).toHaveLength(1 + 4)
    expect(
      montarTrilha(null, [
        { level: 1, label: 'Estagiário' },
        { level: 2, label: 'Engenharia' },
        { level: 3, label: 'Coordenação' },
        { level: 4, label: 'Gerência' },
      ]),
    ).toHaveLength(4 + 4)
  })

  it('usa os rótulos configurados, incluindo um nível que não existe nesta obra', () => {
    const t = montarTrilha(null, [
      { level: 1, label: 'Estagiário' },
      { level: 2, label: 'Engenharia' },
    ])
    expect(t.map((p) => p.rotulo)).toContain('Estagiário')
  })

  it('ordena os níveis mesmo se vierem embaralhados', () => {
    const t = montarTrilha(null, [
      { level: 3, label: 'Gerência' },
      { level: 1, label: 'Engenharia' },
      { level: 2, label: 'Coordenação' },
    ])
    expect(t.slice(1, 4).map((p) => p.rotulo)).toEqual([
      'Engenharia',
      'Coordenação',
      'Gerência',
    ])
  })

  it('rascunho: enviar é o passo atual e nenhuma aprovação começou', () => {
    const t = montarTrilha(progresso('RASCUNHO'), NIVEIS)
    expect(t[0].rotulo).toBe('Enviar medição')
    expect(estados(t)).toEqual([
      'atual',
      'pendente',
      'pendente',
      'pendente',
      'pendente',
      'pendente',
      'pendente',
    ])
  })

  it('em análise no nível 2: o primeiro nível está concluído e o segundo é o atual', () => {
    const t = montarTrilha(progresso('EM_ANALISE', 2), NIVEIS)
    expect(estados(t)).toEqual([
      'concluido', // enviada
      'concluido', // Engenharia
      'atual', // Coordenação
      'pendente', // Gerência
      'pendente',
      'pendente',
      'pendente',
    ])
  })

  it('devolvida: destaca a devolução e zera as aprovações', () => {
    const t = montarTrilha(progresso('DEVOLVIDA', 0), NIVEIS)
    expect(t[0].rotulo).toBe('Devolvida para correção')
    expect(t[0].estado).toBe('devolvido')
    expect(estados(t).slice(1).every((e) => e === 'pendente')).toBe(true)
  })

  it('aprovada: faturamento liberado fica verde e a nota fiscal é o passo atual', () => {
    const t = montarTrilha(progresso('APROVADA', 3), NIVEIS)
    expect(estados(t)).toEqual([
      'concluido',
      'concluido',
      'concluido',
      'concluido',
      'concluido', // Faturamento liberado
      'atual', // Nota fiscal
      'pendente',
    ])
    expect(t[5].detalhe).toBe('Envie a nota fiscal desta medição.')
  })

  it('NF enviada: a liberação fica para trás e a nota é o passo atual', () => {
    const t = montarTrilha(progresso('NF_ENVIADA', 3), NIVEIS)
    expect(t[4].estado).toBe('concluido')
    expect(t[5].rotulo).toBe('Nota fiscal')
    expect(t[5].estado).toBe('atual')
  })

  it('NF aprovada: o pagamento vira o passo atual', () => {
    const t = montarTrilha(progresso('NF_APROVADA', 3), NIVEIS)
    expect(t[6].rotulo).toBe('Pagamento')
    expect(t[6].estado).toBe('atual')
  })

  it('paga: a trilha inteira fica concluída', () => {
    const t = montarTrilha(progresso('PAGA', 3), NIVEIS)
    expect(estados(t).every((e) => e === 'concluido')).toBe(true)
  })

  it('mostra a data prevista de pagamento enquanto não foi pago', () => {
    const t = montarTrilha(progresso('NF_APROVADA', 3, '2026-10-15T00:00:00'), NIVEIS)
    expect(t[6].detalhe).toBe('Previsto para 15/10/2026')
  })

  it('não mostra previsão depois de pago', () => {
    const t = montarTrilha(progresso('PAGA', 3, '2026-10-15T00:00:00'), NIVEIS)
    expect(t[6].detalhe).toBeUndefined()
  })

  it('sem data prevista, o passo de pagamento não inventa detalhe', () => {
    const t = montarTrilha(progresso('NF_APROVADA', 3), NIVEIS)
    expect(t[6].detalhe).toBeUndefined()
  })
})
