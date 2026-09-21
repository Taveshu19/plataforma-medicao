import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function saldo(itemId: string, excluir?: string): Promise<number> {
  const [row] = await sql<{ balance: string }>(
    'select contract_item_balance($1, $2) as balance',
    [itemId, excluir ?? null],
  )
  return Number(row.balance)
}

/**
 * Cria uma medicao em um NOVO periodo do mesmo contrato.
 *
 * `measurements_one_active` (migration 005) permite no maximo uma medicao
 * viva por par (period_id, contract_id). Testes que simulam "uma medicao ja
 * aprovada e agora tenta-se medir de novo" representam, no mundo real, uma
 * competencia (periodo) seguinte — nao uma segunda medicao no mesmo periodo.
 * Este helper cria esse periodo seguinte para poder exercitar o saldo
 * acumulado do contrato sem esbarrar na constraint de periodo anterior.
 */
async function createMeasurementInNewPeriod(
  scenario: Scenario,
  competence: string,
  status: string,
  items: Array<{ contractItemId: string; requested: number; approved?: number }>,
): Promise<string> {
  const [period] = await sql<{ id: string }>(
    `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
     values ($1, $2, $3::date, $3::date, $3::date + interval '9 days')
     returning id`,
    [scenario.companyId, scenario.projectId, competence],
  )
  const [m] = await sql<{ id: string }>(
    `insert into measurements (company_id, period_id, contract_id, status)
     values ($1, $2, $3, $4::measurement_status) returning id`,
    [scenario.companyId, period.id, scenario.contractId, status],
  )
  for (const item of items) {
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
       values ($1, $2, $3, $4, $5)`,
      [scenario.companyId, m.id, item.contractItemId, item.requested, item.approved ?? null],
    )
  }
  return m.id
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('calculo de saldo', () => {
  it('sem medicao alguma, o saldo e a quantidade contratada', async () => {
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('rascunho nao consome saldo', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao em analise consome pelo solicitado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
  })

  it('medicao em analise ja ajustada consome pelo aprovado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao aprovada consome pelo aprovado', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao devolvida devolve o saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao cancelada devolve o saldo', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicoes ja pagas continuam consumindo saldo', async () => {
    await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 40, approved: 40 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(46)
  })

  it('excluir uma medicao do calculo ignora o consumo dela', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId, id)).toBe(86)
  })

  it('saldos de itens diferentes nao se misturam', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    expect(await saldo(s.alvenariaId)).toBe(200)
  })
})

describe('bloqueio de saldo', () => {
  it('recusa medicao acima do saldo e informa o maximo permitido', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    await expect(
      createMeasurementInNewPeriod(s, '2026-10-01', 'RASCUNHO', [
        { contractItemId: s.contrapisoId, requested: 20 },
      ]),
    ).rejects.toThrow(/16/)
  })

  it('aceita medicao exatamente igual ao saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    const id = await createMeasurementInNewPeriod(s, '2026-10-01', 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 16 },
    ])
    expect(id).toBeTruthy()
  })

  it('aprovador pode aumentar a quantidade dentro do saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(
      `update measurement_items set qty_approved = 30
       where measurement_id = $1 and contract_item_id = $2`,
      [id, s.contrapisoId],
    )
    expect(await saldo(s.contrapisoId)).toBe(56)
  })

  it('aprovador nao pode aumentar alem do saldo do item', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      sql(
        `update measurement_items set qty_approved = 100
         where measurement_id = $1 and contract_item_id = $2`,
        [id, s.contrapisoId],
      ),
    ).rejects.toThrow(/86/)
  })
})
