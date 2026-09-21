import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

interface Resumo {
  contracted: string
  approved: string
  in_review: string
  available: string
}

async function resumo(): Promise<Resumo> {
  const [row] = await sql<Resumo>('select * from contract_summary($1)', [s.contractId])
  return row
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('resumo financeiro do contrato', () => {
  it('sem medicao, o contratado e o total dos itens e o saldo e igual a ele', async () => {
    // Contrapiso 86 x 112 = 9.632 ; Alvenaria 200 x 90 = 18.000
    const r = await resumo()
    expect(Number(r.contracted)).toBe(27632)
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao em analise entra em "em aprovacao", nao em "aprovado"', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(2240) // 20 x 112
    expect(Number(r.available)).toBe(27632 - 2240)
  })

  it('medicao em analise ja ajustada usa o valor aprovado pelo engenheiro', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    const r = await resumo()
    expect(Number(r.in_review)).toBe(2016) // 18 x 112
  })

  it('medicao aprovada entra em "aprovado"', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(2016)
    expect(Number(r.in_review)).toBe(0)
  })

  it('rascunho nao entra em lugar nenhum', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao devolvida nao entra e devolve o saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(Number((await resumo()).in_review)).toBe(2240)
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [id])
    const r = await resumo()
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao paga continua contando como aprovada', async () => {
    await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 40, approved: 40 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(4480) // 40 x 112
  })

  it('os quatro numeros sempre fecham: contratado = aprovado + em aprovacao + saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 30, approved: 30 },
    ])
    await sql(
      `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
       values ($1, $2, '2026-10-01', now() - interval '1 day', now() + interval '9 days')`,
      [s.companyId, s.projectId],
    )
    const [p] = await sql<{ id: string }>(
      `select id from measurement_periods where competence = '2026-10-01' and project_id = $1`,
      [s.projectId],
    )
    const [m] = await sql<{ id: string }>(
      `insert into measurements (company_id, period_id, contract_id, status)
       values ($1, $2, $3, 'EM_ANALISE') returning id`,
      [s.companyId, p.id, s.contractId],
    )
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested)
       values ($1, $2, $3, 25)`,
      [s.companyId, m.id, s.alvenariaId],
    )

    const r = await resumo()
    const soma = Number(r.approved) + Number(r.in_review) + Number(r.available)
    expect(soma).toBeCloseTo(Number(r.contracted), 4)
  })

  it('contrato inexistente devolve zeros, nao nulo', async () => {
    const [row] = await sql<Resumo>(
      'select * from contract_summary($1)',
      ['00000000-0000-0000-0000-000000000000'],
    )
    expect(Number(row.contracted)).toBe(0)
    expect(Number(row.available)).toBe(0)
  })
})
