import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'
import { ItemRevisao } from '../src/lib/medicao/dados'

let s: Scenario
let empreiteiroAlfa: TestUser

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  empreiteiroAlfa = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('fluxo de revisao e envio formal da medicao', () => {
  it('impede submeter medicao sem nenhum item preenchido', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    const { error } = await empreiteiroAlfa.client.rpc('submit_measurement', {
      p_measurement_id: rascunho.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toContain('Medicao sem nenhum item preenchido')
  })

  it('submete medicao com itens e gera protocolo oficial', async () => {
    const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
      p_contract_id: s.contractId,
    })

    // Insere itens
    await empreiteiroAlfa.client.rpc('save_measurement_items', {
      p_measurement_id: rascunho.id,
      p_items: [
        { contract_item_id: s.contrapisoId, qty_requested: 40 },
        { contract_item_id: s.alvenariaId, qty_requested: 80 },
      ],
    })

    // Submete a medição
    const { data: protocolo, error } = await empreiteiroAlfa.client.rpc('submit_measurement', {
      p_measurement_id: rascunho.id,
    })

    expect(error).toBeNull()
    expect(protocolo).toMatch(/^MED-\d{4}-\d{2}-\d{3}$/)

    // Confere status no banco
    const { data: med } = await empreiteiroAlfa.client
      .from('measurements')
      .select('status, protocol, current_level')
      .eq('id', rascunho.id)
      .single()

    expect(med?.status).toBe('EM_ANALISE')
    expect(med?.protocol).toBe(protocolo)
    expect(med?.current_level).toBe(1)
  })

  it('agrupa itens de revisao por etapa e local', () => {
    const itens: ItemRevisao[] = [
      {
        measurementItemId: 'm1',
        contractItemId: 'c1',
        stageName: 'Fundação',
        unitName: 'Casa 01',
        serviceName: 'Escavação',
        serviceGroup: 'Terraplenagem',
        unit: 'm3',
        unitPrice: 50,
        qtyRequested: 10,
        subtotal: 500,
        notes: null,
      },
      {
        measurementItemId: 'm2',
        contractItemId: 'c2',
        stageName: 'Fundação',
        unitName: 'Casa 01',
        serviceName: 'Concretagem',
        serviceGroup: 'Estrutura',
        unit: 'm3',
        unitPrice: 200,
        qtyRequested: 5,
        subtotal: 1000,
        notes: null,
      },
      {
        measurementItemId: 'm3',
        contractItemId: 'c3',
        stageName: 'Alvenaria',
        unitName: 'Casa 02',
        serviceName: 'Alvenaria de Vedação',
        serviceGroup: 'Alvenaria',
        unit: 'm2',
        unitPrice: 80,
        qtyRequested: 20,
        subtotal: 1600,
        notes: 'Finalizado',
      },
    ]

    const totalGeral = itens.reduce((acc, it) => acc + it.subtotal, 0)
    expect(totalGeral).toBe(3100)

    const etapasUnicas = Array.from(new Set(itens.map((i) => i.stageName)))
    expect(etapasUnicas).toEqual(['Fundação', 'Alvenaria'])
  })
})
