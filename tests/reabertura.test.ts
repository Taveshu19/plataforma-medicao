import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createScopedUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let outroContratado: string

async function fecharPeriodo(): Promise<void> {
  await sql(
    `update measurement_periods set closes_at = now() - interval '1 day' where id = $1`,
    [s.periodId],
  )
}

async function aberto(contractorId: string): Promise<boolean> {
  const [row] = await sql<{ open: boolean }>('select is_period_open($1, $2) as open', [
    s.periodId,
    contractorId,
  ])
  return row.open
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  const [c] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreeteira Beta') returning id`,
    [s.companyId],
  )
  outroContratado = c.id
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('janela de medicao', () => {
  it('periodo dentro do prazo esta aberto', async () => {
    await sql(
      `update measurement_periods set opens_at = now() - interval '1 day',
                                      closes_at = now() + interval '1 day'
       where id = $1`,
      [s.periodId],
    )
    expect(await aberto(s.contractorId)).toBe(true)
  })

  it('periodo vencido esta fechado', async () => {
    await fecharPeriodo()
    expect(await aberto(s.contractorId)).toBe(false)
  })

  it('bloqueia edicao de medicao com periodo fechado', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await fecharPeriodo()
    await expect(
      sql(
        `insert into measurement_items
           (company_id, measurement_id, contract_item_id, qty_requested)
         values ($1, $2, $3, 10)`,
        [s.companyId, id, s.contrapisoId],
      ),
    ).rejects.toThrow(/periodo/i)
  })
})

describe('reabertura', () => {
  it('reabre somente para o empreiteiro indicado', async () => {
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Atraso na entrega do relatorio de campo.',
    ])
    expect(await aberto(s.contractorId)).toBe(true)
    expect(await aberto(outroContratado)).toBe(false)
  })

  it('exige motivo', async () => {
    await fecharPeriodo()
    await expect(
      sql('select reopen_period($1, $2, $3, $4)', [
        s.periodId,
        s.contractorId,
        new Date(Date.now() + 86400000).toISOString(),
        '',
      ]),
    ).rejects.toThrow(/motivo/i)
  })

  it('reabertura vencida nao vale mais', async () => {
    await fecharPeriodo()
    await sql(
      `insert into period_reopenings
         (company_id, period_id, contractor_id, reopened_until, reason)
       values ($1, $2, $3, now() - interval '1 hour', 'Expirada')`,
      [s.companyId, s.periodId, s.contractorId],
    )
    expect(await aberto(s.contractorId)).toBe(false)
  })

  it('reabertura libera edicao do rascunho', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Reabertura autorizada pela gerencia.',
    ])
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested)
       values ($1, $2, $3, 10)`,
      [s.companyId, id, s.contrapisoId],
    )
    const rows = await sql('select 1 from measurement_items where measurement_id = $1', [id])
    expect(rows).toHaveLength(1)
  })

  it('reabertura nao ressuscita medicao aprovada', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Reabertura autorizada.',
    ])
    await expect(
      sql(
        `update measurement_items set qty_requested = 30
         where measurement_id = $1 and contract_item_id = $2`,
        [id, s.contrapisoId],
      ),
    ).rejects.toThrow(/aprovada/i)
  })

  it('registra quem reabriu e por que', async () => {
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Falha de conexao na obra.',
    ])
    const [row] = await sql<{ reason: string; contractor_id: string }>(
      'select reason, contractor_id from period_reopenings where period_id = $1',
      [s.periodId],
    )
    expect(row.reason).toBe('Falha de conexao na obra.')
    expect(row.contractor_id).toBe(s.contractorId)
  })
})

describe('isolamento RLS em period_reopenings (controle negativo)', () => {
  it('usuario de outra obra nao ve reaberturas desta obra', async () => {
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Reabertura obra 1.',
    ])

    const [proj2] = await sql<{ id: string }>(
      `insert into projects (company_id, name, unit_label, approval_levels)
       values ($1, 'Obra Sul', 'casa', 1) returning id`,
      [s.companyId],
    )
    const eng2 = await createScopedUser('eng2@vista.com.br', s.companyId, proj2.id, 'engenharia')
    const eng1 = await createScopedUser('eng1@vista.com.br', s.companyId, s.projectId, 'engenharia')

    const { data: list1, error: err1 } = await eng1.client
      .from('period_reopenings')
      .select('reason, period_id')
      .eq('period_id', s.periodId)
    expect(err1).toBeNull()
    expect(list1).toHaveLength(1)

    // Controle negativo
    const { data: list2, error: err2 } = await eng2.client
      .from('period_reopenings')
      .select('reason, period_id')
      .eq('period_id', s.periodId)
    expect(err2).toBeNull()
    expect(list2).toEqual([])
  })
})
