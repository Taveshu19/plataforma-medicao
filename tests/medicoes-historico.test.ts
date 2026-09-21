import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiro: TestUser

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role) values
       ($1, $2, 1, 'Engenharia',  'engenharia'),
       ($1, $2, 2, 'Coordenacao', 'coordenacao'),
       ($1, $2, 3, 'Gerencia',    'gerencia')`,
    [s.companyId, s.projectId],
  )

  empreiteiro = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiro.userId,
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('historico de medicoes do empreiteiro', () => {
  it('retorna a lista de medicoes com status e valores', async () => {
    // 1. Cria e envia medição
    const { data: rascunho } = await empreiteiro.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    await empreiteiro.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 25 }],
    })

    await empreiteiro.client.rpc('submit_measurement', {
      p_measurement_id: rascunho.id,
    })

    // 2. Consulta histórico
    const { data: lista, error } = await empreiteiro.client
      .from('measurements')
      .select('id, protocol, status')
      .eq('contract_id', s.contractId)

    expect(error).toBeNull()
    expect(lista?.length).toBe(1)
    expect(lista![0].status).toBe('EM_ANALISE')
  })

  it('exibe motivo de devolucao quando a medicao e devolvida', async () => {
    const engenheiro = await createUser('eng@test.com', s.companyId, 'engenharia')

    const { data: rascunho } = await empreiteiro.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    await empreiteiro.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 25 }],
    })

    await empreiteiro.client.rpc('submit_measurement', {
      p_measurement_id: rascunho.id,
    })

    // Engenheiro devolve com motivo
    await engenheiro.client.rpc('return_measurement', {
      p_measurement_id: rascunho.id,
      p_reason: 'Foto da regularização não anexada',
    })

    // Confere auditoria com o motivo
    const [audit] = await sql<{ reason: string }>(
      `select reason from audit_log
       where measurement_id = $1 and action = 'DEVOLVIDA'
       order by created_at desc limit 1`,
      [rascunho.id],
    )

    expect(audit?.reason).toBe('Foto da regularização não anexada')
  })
})
