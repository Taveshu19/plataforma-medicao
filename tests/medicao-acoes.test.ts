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

describe('save_measurement_items (salvamento de itens via RLS)', () => {
  it('empreiteiro salva itens no rascunho com sucesso', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })
    expect(rascunho?.id).toBeTruthy()

    const { error } = await empreiteiroAlfa.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [
        {
          contract_item_id: s.contrapisoId,
          qty_requested: 50,
          notes: 'Metade feita',
        },
      ],
    })

    expect(error).toBeNull()

    // Verifica item gravado
    const { data: itens } = await empreiteiroAlfa.client
      .from('measurement_items')
      .select('contract_item_id, qty_requested, notes')
      .eq('measurement_id', rascunho.id)

    expect(itens?.length).toBe(1)
    expect(Number(itens![0].qty_requested)).toBe(50)
    expect(itens![0].notes).toBe('Metade feita')
  })

  it('exclui o item quando a quantidade for zerada', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    // Primeiro insere
    await empreiteiroAlfa.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 30 }],
    })

    // Depois atualiza com 0
    const { error } = await empreiteiroAlfa.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 0 }],
    })

    expect(error).toBeNull()

    const { data: itens } = await empreiteiroAlfa.client
      .from('measurement_items')
      .select('id')
      .eq('measurement_id', rascunho.id)

    expect(itens?.length).toBe(0)
  })

  it('rejeita salvar item com quantidade acima do saldo disponivel', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    // s.item1Id tem saldo total de 100
    const { error } = await empreiteiroAlfa.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 150 }],
    })

    expect(error).not.toBeNull()
    expect(error?.message).toContain('Quantidade acima do saldo disponivel')
  })

  it('impede que empreiteiro salve itens em medicao de outro empreiteiro', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    const { error } = await empreiteiroBeta.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [{ contract_item_id: s.contrapisoId, qty_requested: 10 }],
    })

    expect(error).not.toBeNull()
    expect(error?.message).toContain('Permissao negada')
  })
})
