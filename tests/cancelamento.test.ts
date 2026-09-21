import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function cancelar(id: string, motivo = 'Lancamento em duplicidade.') {
  return sql('select cancel_measurement($1, $2)', [id, motivo])
}

async function statusDe(id: string): Promise<string> {
  const [linha] = await sql<{ status: string }>(
    'select status::text as status from measurements where id = $1',
    [id],
  )
  return linha.status
}

async function saldo(itemId: string): Promise<number> {
  const [linha] = await sql<{ b: string }>('select contract_item_balance($1) as b', [itemId])
  return Number(linha.b)
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('cancelamento de medição', () => {
  it('cancela uma medição em análise', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await cancelar(id)
    expect(await statusDe(id)).toBe('CANCELADA')
  })

  it('cancela uma medição já aprovada, que é o caso que motiva existir', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await cancelar(id, 'Quantidade conferida errada na fachada.')
    expect(await statusDe(id)).toBe('CANCELADA')
  })

  it('devolve o saldo ao cancelar', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
    await cancelar(id)
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('libera o período para uma medição nova no mesmo contrato', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      createMeasurement(s, 'RASCUNHO', [{ contractItemId: s.contrapisoId, requested: 10 }]),
    ).rejects.toThrow()

    await cancelar(id)

    const nova = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 10 },
    ])
    expect(nova).toBeTruthy()
  })

  it('exige motivo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(cancelar(id, '  ')).rejects.toThrow(/motivo/i)
    await expect(cancelar(id, 'erro')).rejects.toThrow(/motivo/i)
  })

  it('recusa cancelar duas vezes', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await cancelar(id)
    await expect(cancelar(id)).rejects.toThrow(/ja esta cancelada/i)
  })

  it('recusa cancelar medição já paga', async () => {
    const id = await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await expect(cancelar(id)).rejects.toThrow(/ja paga/i)
  })

  it('registra o cancelamento na auditoria com motivo e status anterior', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await cancelar(id, 'Medicao duplicada pelo empreiteiro.')

    const [evento] = await sql<{ old_value: string; new_value: string; reason: string }>(
      `select old_value, new_value, reason from audit_log
       where measurement_id = $1 and action = 'CANCELADA' order by created_at desc limit 1`,
      [id],
    )
    expect(evento.old_value).toBe('APROVADA')
    expect(evento.new_value).toBe('CANCELADA')
    expect(evento.reason).toBe('Medicao duplicada pelo empreiteiro.')
  })
})

describe('permissão de cancelamento', () => {
  let empreiteiro: TestUser
  let gerente: TestUser
  let medicao: string

  beforeEach(async () => {
    gerente = await createUser('ger.cancel@vista.test', s.companyId, 'gerencia')
    empreiteiro = await createUser('alfa.cancel@alfa.test', s.companyId, 'empreiteiro')
    await sql('update memberships set contractor_id = $1 where user_id = $2', [
      s.contractorId,
      empreiteiro.userId,
    ])
    medicao = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
  })

  it('o empreiteiro NÃO cancela a própria medição aprovada', async () => {
    const { error } = await empreiteiro.client.rpc('cancel_measurement', {
      p_measurement_id: medicao,
      p_reason: 'quero refazer com outro valor',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/equipe da construtora/i)
    expect(await statusDe(medicao)).toBe('APROVADA')
  })

  it('a equipe da construtora cancela', async () => {
    const { error } = await gerente.client.rpc('cancel_measurement', {
      p_measurement_id: medicao,
      p_reason: 'Conferencia apontou erro de quantidade.',
    })
    expect(error).toBeNull()
    expect(await statusDe(medicao)).toBe('CANCELADA')
  })
})
