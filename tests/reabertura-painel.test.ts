import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

interface LinhaPainel {
  contractor_name: string
  contract_number: string
  measurement_id: string | null
  measurement_status: string | null
  period_open: boolean
  reopened_until: string | null
}

async function painel(): Promise<LinhaPainel[]> {
  return sql<LinhaPainel>('select * from get_period_contractors_status($1)', [s.periodId])
}

async function fecharPeriodo(): Promise<void> {
  await sql(
    `update measurement_periods set closes_at = now() - interval '1 day' where id = $1`,
    [s.periodId],
  )
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('painel de prazos do período', () => {
  it('lista o empreiteiro mesmo sem medição nenhuma', async () => {
    const linhas = await painel()
    expect(linhas).toHaveLength(1)
    expect(linhas[0].contract_number).toBe('023/2026')
    expect(linhas[0].measurement_id).toBeNull()
    expect(linhas[0].measurement_status).toBeNull()
  })

  it('mostra o status da medição quando existe', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const [linha] = await painel()
    expect(linha.measurement_status).toBe('EM_ANALISE')
    expect(linha.measurement_id).toBeTruthy()
  })

  it('ignora medição cancelada, para o empreiteiro aparecer como pendente', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    const [linha] = await painel()
    expect(linha.measurement_id).toBeNull()
  })

  it('indica prazo aberto enquanto o período está dentro da janela', async () => {
    expect((await painel())[0].period_open).toBe(true)
  })

  it('indica prazo fechado depois do vencimento', async () => {
    await fecharPeriodo()
    expect((await painel())[0].period_open).toBe(false)
  })

  it('volta a indicar aberto para quem teve o prazo reaberto, e só para ele', async () => {
    const [outro] = await sql<{ id: string }>(
      `insert into contractors (company_id, name) values ($1, 'Empreiteira Zeta') returning id`,
      [s.companyId],
    )
    await sql(
      `insert into contracts (company_id, project_id, contractor_id, number)
       values ($1, $2, $3, '077/2026')`,
      [s.companyId, s.projectId, outro.id],
    )

    await fecharPeriodo()
    expect((await painel()).every((l) => !l.period_open)).toBe(true)

    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Falha de conexao na obra.',
    ])

    const linhas = await painel()
    const alfa = linhas.find((l) => l.contract_number === '023/2026')!
    const zeta = linhas.find((l) => l.contract_number === '077/2026')!
    expect(alfa.period_open).toBe(true)
    expect(alfa.reopened_until).toBeTruthy()
    expect(zeta.period_open).toBe(false)
  })
})

describe('permissão de reabertura', () => {
  let empreiteiro: TestUser
  let engenheiro: TestUser

  beforeEach(async () => {
    engenheiro = await createUser('eng.prazo@vista.test', s.companyId, 'engenharia')
    empreiteiro = await createUser('alfa.prazo@alfa.test', s.companyId, 'empreiteiro')
    await sql('update memberships set contractor_id = $1 where user_id = $2', [
      s.contractorId,
      empreiteiro.userId,
    ])
  })

  it('a equipe da construtora enxerga o painel', async () => {
    const { data, error } = await engenheiro.client.rpc('get_period_contractors_status', {
      p_period_id: s.periodId,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('o empreiteiro NÃO enxerga o painel de prazos', async () => {
    const { error } = await empreiteiro.client.rpc('get_period_contractors_status', {
      p_period_id: s.periodId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/equipe da construtora/i)
  })

  it('o empreiteiro NÃO consegue reabrir o próprio prazo', async () => {
    const { error } = await empreiteiro.client.rpc('reopen_period', {
      p_period_id: s.periodId,
      p_contractor_id: s.contractorId,
      p_until: new Date(Date.now() + 86400000).toISOString(),
      p_reason: 'quero mais prazo',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/equipe da construtora/i)
  })

  it('a equipe da construtora consegue reabrir', async () => {
    const { error } = await engenheiro.client.rpc('reopen_period', {
      p_period_id: s.periodId,
      p_contractor_id: s.contractorId,
      p_until: new Date(Date.now() + 86400000).toISOString(),
      p_reason: 'Empreiteiro sem sinal no dia do fechamento.',
    })
    expect(error).toBeNull()

    const [linha] = await sql<{ reason: string }>(
      'select reason from period_reopenings where period_id = $1',
      [s.periodId],
    )
    expect(linha.reason).toBe('Empreiteiro sem sinal no dia do fechamento.')
  })

  it('a reabertura fica registrada na auditoria com o motivo', async () => {
    await engenheiro.client.rpc('reopen_period', {
      p_period_id: s.periodId,
      p_contractor_id: s.contractorId,
      p_until: new Date(Date.now() + 86400000).toISOString(),
      p_reason: 'Autorizado pela gerencia.',
    })

    const [evento] = await sql<{ action: string; reason: string }>(
      `select action, reason from audit_log where action = 'PERIODO_REABERTO'`,
    )
    expect(evento.action).toBe('PERIODO_REABERTO')
    expect(evento.reason).toBe('Autorizado pela gerencia.')
  })
})
