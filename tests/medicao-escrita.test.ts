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

  // Empreiteiro Alfa vinculado ao contractor da Alfa
  empreiteiroAlfa = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])

  // Empreiteiro Beta vinculado a outro contractor
  const [contractorBeta] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreiteira Beta') returning id`,
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

describe('policies de escrita em measurements e measurement_items', () => {
  it('empreiteiro consegue criar um rascunho de medicao para o proprio contrato', async () => {
    const { data, error } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id, status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('RASCUNHO')
    expect(data?.id).toBeTruthy()
  })

  it('empreiteiro nao consegue criar medicao para contrato de outro empreiteiro', async () => {
    const { error } = await empreiteiroBeta.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })

    expect(error).not.toBeNull()
  })

  it('empreiteiro nao consegue criar medicao ja aprovada ou em analise', async () => {
    const { error } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'APROVADA',
      })

    expect(error).not.toBeNull()
  })

  it('empreiteiro consegue inserir e atualizar itens no rascunho', async () => {
    const { data: m } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id')
      .single()

    // Insere item
    const { data: item, error: itemError } = await empreiteiroAlfa.client
      .from('measurement_items')
      .insert({
        company_id: s.companyId,
        measurement_id: m!.id,
        contract_item_id: s.contrapisoId,
        qty_requested: 20,
      })
      .select('id, qty_requested')
      .single()

    expect(itemError).toBeNull()
    expect(Number(item?.qty_requested)).toBe(20)

    // Atualiza quantidade solicitada
    const { error: updateError } = await empreiteiroAlfa.client
      .from('measurement_items')
      .update({ qty_requested: 25 })
      .eq('id', item!.id)

    expect(updateError).toBeNull()

    const { data: itemAtualizado } = await empreiteiroAlfa.client
      .from('measurement_items')
      .select('qty_requested')
      .eq('id', item!.id)
      .single()

    expect(Number(itemAtualizado?.qty_requested)).toBe(25)
  })

  it('empreiteiro nao consegue inserir item em medicao de outro', async () => {
    const { data: m } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id')
      .single()

    const { error } = await empreiteiroBeta.client
      .from('measurement_items')
      .insert({
        company_id: s.companyId,
        measurement_id: m!.id,
        contract_item_id: s.contrapisoId,
        qty_requested: 10,
      })

    expect(error).not.toBeNull()
  })

  it('empreiteiro consegue excluir item do rascunho', async () => {
    const { data: m } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id')
      .single()

    const { data: item } = await empreiteiroAlfa.client
      .from('measurement_items')
      .insert({
        company_id: s.companyId,
        measurement_id: m!.id,
        contract_item_id: s.contrapisoId,
        qty_requested: 20,
      })
      .select('id')
      .single()

    const { error: delError } = await empreiteiroAlfa.client
      .from('measurement_items')
      .delete()
      .eq('id', item!.id)

    expect(delError).toBeNull()

    const { data: itensRestantes } = await empreiteiroAlfa.client
      .from('measurement_items')
      .select('id')
      .eq('id', item!.id)

    expect(itensRestantes).toHaveLength(0)
  })

  it('empreiteiro consegue enviar a medicao chamando submit_measurement', async () => {
    const { data: m } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id')
      .single()

    await empreiteiroAlfa.client
      .from('measurement_items')
      .insert({
        company_id: s.companyId,
        measurement_id: m!.id,
        contract_item_id: s.contrapisoId,
        qty_requested: 20,
      })

    const { data: protocol, error } = await empreiteiroAlfa.client.rpc('submit_measurement', {
      p_measurement_id: m!.id,
    })

    expect(error).toBeNull()
    expect(protocol).toMatch(/^MED-\d{4}-\d{2}-\d{3}$/)

    // Confirma que a medicao agora esta EM_ANALISE
    const { data: medicaoEnviada } = await empreiteiroAlfa.client
      .from('measurements')
      .select('status, protocol')
      .eq('id', m!.id)
      .single()

    expect(medicaoEnviada?.status).toBe('EM_ANALISE')
    expect(medicaoEnviada?.protocol).toBe(protocol)
  })

  it('apos envio, empreiteiro nao consegue mais alterar itens da medicao', async () => {
    const { data: m } = await empreiteiroAlfa.client
      .from('measurements')
      .insert({
        company_id: s.companyId,
        period_id: s.periodId,
        contract_id: s.contractId,
        status: 'RASCUNHO',
      })
      .select('id')
      .single()

    const { data: item } = await empreiteiroAlfa.client
      .from('measurement_items')
      .insert({
        company_id: s.companyId,
        measurement_id: m!.id,
        contract_item_id: s.contrapisoId,
        qty_requested: 20,
      })
      .select('id')
      .single()

    await empreiteiroAlfa.client.rpc('submit_measurement', { p_measurement_id: m!.id })

    // Tentativa de alterar apos envio: RLS filtra a linha e 0 linhas sao afetadas
    const { data: updated } = await empreiteiroAlfa.client
      .from('measurement_items')
      .update({ qty_requested: 30 })
      .eq('id', item!.id)
      .select()

    expect(updated).toHaveLength(0)

    const { data: itemDepois } = await empreiteiroAlfa.client
      .from('measurement_items')
      .select('qty_requested')
      .eq('id', item!.id)
      .single()

    expect(Number(itemDepois?.qty_requested)).toBe(20)
  })

})
