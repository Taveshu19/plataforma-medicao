import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiroAlfa: TestUser
let engenheiro: TestUser
let coordenador: TestUser
let measurementId: string

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  // Níveis de aprovação
  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role) values
       ($1, $2, 1, 'Engenharia',  'engenharia'),
       ($1, $2, 2, 'Coordenacao', 'coordenacao'),
       ($1, $2, 3, 'Gerencia',    'gerencia')`,
    [s.companyId, s.projectId],
  )

  // Empreiteiro Alfa
  empreiteiroAlfa = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])

  // Engenheiro (nível 1)
  engenheiro = await createUser('eng@test.com', s.companyId, 'engenharia')

  // Coordenador (nível 2)
  coordenador = await createUser('coord@test.com', s.companyId, 'coordenacao')

  // Cria rascunho, preenche e submete pelo empreiteiro Alfa
  const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
    p_contract_id: s.contractId,
  })
  measurementId = rascunho.id

  await empreiteiroAlfa.client.rpc('save_measurement_items', {
    p_measurement_id: measurementId,
    p_items: [
      { contract_item_id: s.contrapisoId, qty_requested: 50, notes: '50m feitos' },
      { contract_item_id: s.alvenariaId, qty_requested: 80, notes: '80m feitos' },
    ],
  })

  await empreiteiroAlfa.client.rpc('submit_measurement', {
    p_measurement_id: measurementId,
  })
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('fluxo de analise e aprovacao da engenharia', () => {
  it('engenheiro visualiza medição submetida em analise', async () => {
    const { data: medicoes, error } = await engenheiro.client.rpc('get_pending_measurements')
    expect(error).toBeNull()
    expect(medicoes?.length).toBeGreaterThanOrEqual(1)

    const med = medicoes.find((m: any) => m.id === measurementId)
    expect(med).toBeTruthy()
    expect(med.status).toBe('EM_ANALISE')
    expect(med.current_level).toBe(1)
  })

  it('empreiteiro nao consegue aprovar nem devolver medicao', async () => {
    const { error: errAprovar } = await empreiteiroAlfa.client.rpc('approve_measurement', {
      p_measurement_id: measurementId,
    })
    expect(errAprovar).not.toBeNull()

    const { error: errDevolver } = await empreiteiroAlfa.client.rpc('return_measurement', {
      p_measurement_id: measurementId,
      p_reason: 'Motivo qualquer',
    })
    expect(errDevolver).not.toBeNull()
  })

  it('engenheiro ajusta quantidade aprovada com auditoria', async () => {
    // Busca os itens da medição
    const { data: itens } = await engenheiro.client.rpc('get_measurement_analysis_details', {
      p_measurement_id: measurementId,
    })
    expect(itens?.length).toBe(2)

    const itemContrapiso = itens.find((i: any) => i.contract_item_id === s.contrapisoId)
    expect(itemContrapiso).toBeTruthy()

    // Ajusta contrapiso de 50 para 40
    const { error: errAjuste } = await engenheiro.client.rpc('adjust_item_approved_qty', {
      p_item_id: itemContrapiso.item_id,
      p_qty_approved: 40,
    })
    expect(errAjuste).toBeNull()

    // Confere auditoria
    const [audit] = await sql<{ action: string; old_value: string; new_value: string }>(
      `select action, old_value, new_value from audit_log
       where entity_id = $1 and action = 'QUANTIDADE_AJUSTADA'
       order by created_at desc limit 1`,
      [itemContrapiso.item_id],
    )
    expect(audit).toBeTruthy()
    expect(Number(audit.new_value)).toBe(40)
  })

  it('engenheiro nao consegue aprovar quantidade acima do saldo', async () => {
    const { data: itens } = await engenheiro.client.rpc('get_measurement_analysis_details', {
      p_measurement_id: measurementId,
    })
    const itemContrapiso = itens.find((i: any) => i.contract_item_id === s.contrapisoId)

    // Contrapiso tem saldo total de 86
    const { error } = await engenheiro.client.rpc('adjust_item_approved_qty', {
      p_item_id: itemContrapiso.item_id,
      p_qty_approved: 150,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('saldo')
  })

  it('engenheiro devolve medicao com motivo obrigatorio', async () => {
    // Sem motivo deve falhar
    const { error: errSemMotivo } = await engenheiro.client.rpc('return_measurement', {
      p_measurement_id: measurementId,
      p_reason: '',
    })
    expect(errSemMotivo).not.toBeNull()

    // Com motivo deve devolver
    const { error: errComMotivo } = await engenheiro.client.rpc('return_measurement', {
      p_measurement_id: measurementId,
      p_reason: 'Alvenaria com acabamento irregular na Casa 07',
    })
    expect(errComMotivo).toBeNull()

    const [med] = await sql<{ status: string; current_level: number }>(
      `select status, current_level from measurements where id = $1`,
      [measurementId],
    )
    expect(med.status).toBe('DEVOLVIDA')
    expect(med.current_level).toBe(0)
  })

  it('engenheiro aprova medicao e ela avanca para a coordenacao (nivel 2)', async () => {
    const { data: novoStatus, error } = await engenheiro.client.rpc('approve_measurement', {
      p_measurement_id: measurementId,
    })
    expect(error).toBeNull()
    expect(novoStatus).toBe('EM_ANALISE')

    const [med] = await sql<{ current_level: number; status: string }>(
      `select current_level, status from measurements where id = $1`,
      [measurementId],
    )
    expect(med.current_level).toBe(2)
    expect(med.status).toBe('EM_ANALISE')
  })
})
