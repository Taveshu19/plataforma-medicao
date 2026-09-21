import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'

let s: Scenario
let engenheiro: TestUser
let measurementId: string

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

  const empreiteiro = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiro.userId,
  ])

  engenheiro = await createUser('eng@test.com', s.companyId, 'engenharia')

  const { data: rascunho } = await empreiteiro.client.rpc('get_or_create_draft', {
    p_contract_id: s.contractId,
  })
  measurementId = rascunho.id

  await empreiteiro.client.rpc('save_measurement_items', {
    p_measurement_id: measurementId,
    p_items: [
      { contract_item_id: s.contrapisoId, qty_requested: 30 },
      { contract_item_id: s.alvenariaId, qty_requested: 50 },
    ],
  })

  await empreiteiro.client.rpc('submit_measurement', {
    p_measurement_id: measurementId,
  })
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('consultas de apoio e detalhes de analise', () => {
  it('retorna os dados consolidados da medicao e seus itens', async () => {
    const { data: itens, error } = await engenheiro.client.rpc('get_measurement_analysis_details', {
      p_measurement_id: measurementId,
    })

    expect(error).toBeNull()
    expect(itens?.length).toBe(2)

    const item1 = itens?.find((i: any) => i.contract_item_id === s.contrapisoId)
    expect(item1).toBeTruthy()
    expect(Number(item1.qty_requested)).toBe(30)
    expect(Number(item1.qty_approved)).toBe(30) // default igual ao solicitado
    expect(Number(item1.subtotal_requested)).toBe(30 * 112)
    expect(Number(item1.subtotal_approved)).toBe(30 * 112)
  })
})
