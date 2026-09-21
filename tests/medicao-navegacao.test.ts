import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiroAlfa: TestUser
let empreiteiroBeta: TestUser

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  empreiteiroAlfa = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])

  const [contractorBeta] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreeteira Beta') returning id`,
    [s.companyId],
  )
  empreiteiroBeta = await createUser('beta@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    contractorBeta.id,
    empreiteiroBeta.userId,
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('funcoes de dados e navegacao da medicao', () => {
  it('get_or_create_draft cria um rascunho e reutiliza se chamado novamente', async () => {
    const { data: d1, error: err1 } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    expect(err1).toBeNull()
    expect(d1?.id).toBeTruthy()
    expect(d1?.status).toBe('RASCUNHO')

    // Segunda chamada para o mesmo contrato
    const { data: d2, error: err2 } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    expect(err2).toBeNull()
    expect(d2?.id).toBe(d1?.id)
  })

  it('get_or_create_draft recusa acesso para contrato de outro empreiteiro', async () => {
    const { error } = await empreiteiroBeta.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    expect(error).not.toBeNull()
  })

  it('lista etapas e locais com contagem de itens totais e medidos', async () => {
    const { data: draft } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    // Antes de medir qualquer item
    const { data: locaisAntes, error: errAntes } = await empreiteiroAlfa.client.rpc(
      'get_measurement_stages_and_units',
      { p_measurement_id: draft.id },
    )

    expect(errAntes).toBeNull()
    expect(locaisAntes).toHaveLength(1)
    expect(locaisAntes[0].unit_name).toBe('Casa 07')
    expect(locaisAntes[0].stage_name).toBe('Casas 01 a 20')
    expect(Number(locaisAntes[0].total_items)).toBe(2)
    expect(Number(locaisAntes[0].measured_items)).toBe(0)

    // Insere medicao de um dos itens
    await empreiteiroAlfa.client.from('measurement_items').insert({
      company_id: s.companyId,
      measurement_id: draft.id,
      contract_item_id: s.contrapisoId,
      qty_requested: 20,
    })

    const { data: locaisDepois } = await empreiteiroAlfa.client.rpc(
      'get_measurement_stages_and_units',
      { p_measurement_id: draft.id },
    )

    expect(Number(locaisDepois[0].measured_items)).toBe(1)
    expect(Number(locaisDepois[0].total_measured)).toBe(20 * 112)
  })

  it('lista servicos do local com saldo disponivel e quantidade solicitada', async () => {
    const { data: draft } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    await empreiteiroAlfa.client.from('measurement_items').insert({
      company_id: s.companyId,
      measurement_id: draft.id,
      contract_item_id: s.contrapisoId,
      qty_requested: 20,
    })

    const { data: servicos, error } = await empreiteiroAlfa.client.rpc(
      'get_unit_services_for_measurement',
      {
        p_measurement_id: draft.id,
        p_unit_id: s.unitId,
      },
    )

    expect(error).toBeNull()
    expect(servicos).toHaveLength(2)

    const contrapiso = servicos.find((srv: { service_name: string }) => srv.service_name === 'Contrapiso')
    const alvenaria = servicos.find((srv: { service_name: string }) => srv.service_name === 'Alvenaria')

    expect(Number(contrapiso.quantity)).toBe(86)
    expect(Number(contrapiso.unit_price)).toBe(112)
    expect(Number(contrapiso.balance)).toBe(86)
    expect(Number(contrapiso.measured_qty)).toBe(20)
    expect(Number(contrapiso.subtotal)).toBe(2240)

    expect(Number(alvenaria.quantity)).toBe(200)
    expect(Number(alvenaria.unit_price)).toBe(90)
    expect(Number(alvenaria.balance)).toBe(200)
    expect(Number(alvenaria.measured_qty)).toBe(0)
    expect(Number(alvenaria.subtotal)).toBe(0)
  })
})
