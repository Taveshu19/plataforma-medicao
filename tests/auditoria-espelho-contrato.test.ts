import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiroAlfa: TestUser
let empreiteiroBeta: TestUser
let engenheiro: TestUser
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
  empreiteiroAlfa = await createUser('alfa-espelho@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])

  // Empreiteiro Beta (outro empreiteiro para teste de isolamento negativo)
  const bRows = await sql<{ id: string }>(
    `insert into contractors (company_id, name, document) values ($1, 'Beta Ltda', '99888777000166') returning id`,
    [s.companyId],
  )
  const contractorBetaId = bRows[0].id
  empreiteiroBeta = await createUser('beta-espelho@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    contractorBetaId,
    empreiteiroBeta.userId,
  ])

  // Engenheiro
  engenheiro = await createUser('eng-espelho@test.com', s.companyId, 'engenharia')

  // Alfa cria e envia uma medição
  const { data: rascunho } = await empreiteiroAlfa.client.rpc('get_or_create_draft', {
    p_contract_id: s.contractId,
  })
  measurementId = rascunho.id

  await empreiteiroAlfa.client.rpc('save_measurement_items', {
    p_measurement_id: measurementId,
    p_items: [
      { contract_item_id: s.contrapisoId, qty_requested: 40, notes: '40m feitos' },
      { contract_item_id: s.alvenariaId, qty_requested: 60, notes: '60m feitos' },
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

describe('get_contract_items_overview (Visão do Contrato)', () => {
  it('retorna os itens contratados com saldo e quantidades calculadas para o empreiteiro', async () => {
    const { data, error } = await empreiteiroAlfa.client.rpc('get_contract_items_overview', {
      p_contract_id: s.contractId,
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.length).toBeGreaterThanOrEqual(2)

    const contrapiso = data.find((i: any) => i.item_id === s.contrapisoId)
    expect(contrapiso).toBeDefined()
    expect(contrapiso.service_name).toBe('Contrapiso')
    expect(Number(contrapiso.quantity)).toBe(86)
    expect(Number(contrapiso.unit_price)).toBe(112)
    expect(Number(contrapiso.total_price)).toBe(86 * 112)
    // 40m estão em medição submetida (em análise consome saldo)
    expect(Number(contrapiso.balance_qty)).toBe(46)
    expect(Number(contrapiso.measured_qty)).toBe(40)
  })

  it('impede que outro empreiteiro veja os itens de contrato alheio (controle negativo)', async () => {
    const { data, error } = await empreiteiroBeta.client.rpc('get_contract_items_overview', {
      p_contract_id: s.contractId,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permissao negada/i)
    expect(data).toBeNull()
  })
})

describe('get_measurement_audit_timeline (Linha do Tempo de Auditoria)', () => {
  it('registra eventos cronológicos com atores, ações e justificativas', async () => {
    // 1. Engenheiro ajusta quantidade aprovada do contrapiso de 40 para 35
    const miItems = await sql<{ id: string }>(
      'select id from measurement_items where measurement_id = $1 and contract_item_id = $2',
      [measurementId, s.contrapisoId],
    )
    const { error: errAjuste } = await engenheiro.client.rpc('adjust_item_approved_qty', {
      p_item_id: miItems[0].id,
      p_qty_approved: 35,
    })
    expect(errAjuste).toBeNull()

    // 2. Engenheiro devolve com motivo
    const { error: errDevolucao } = await engenheiro.client.rpc('return_measurement', {
      p_measurement_id: measurementId,
      p_reason: 'Foto da alvenaria ilegível, favor reenviar.',
    })
    expect(errDevolucao).toBeNull()

    // Consulta a linha do tempo
    const { data: timeline, error } = await engenheiro.client.rpc('get_measurement_audit_timeline', {
      p_measurement_id: measurementId,
    })

    expect(error).toBeNull()
    expect(timeline).toBeDefined()
    expect(timeline.length).toBeGreaterThanOrEqual(3)

    // Evento de envio
    const evEnvio = timeline.find((e: any) => e.action === 'ENVIADA')
    expect(evEnvio).toBeDefined()

    // Evento de ajuste
    const evAjuste = timeline.find((e: any) => e.action === 'QUANTIDADE_AJUSTADA')
    expect(evAjuste).toBeDefined()
    expect(evAjuste.service_name).toBe('Contrapiso')
    expect(Number(evAjuste.old_value)).toBe(40)
    expect(Number(evAjuste.new_value)).toBe(35)

    // Evento de devolução
    const evDevolucao = timeline.find((e: any) => e.action === 'DEVOLVIDA')
    expect(evDevolucao).toBeDefined()
    expect(evDevolucao.reason).toBe('Foto da alvenaria ilegível, favor reenviar.')
  })

  it('impede que empreiteiro de outro contrato visualize a trilha de auditoria (controle negativo)', async () => {
    const { data, error } = await empreiteiroBeta.client.rpc('get_measurement_audit_timeline', {
      p_measurement_id: measurementId,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permissao negada/i)
    expect(data).toBeNull()
  })
})

describe('get_measurement_statement (Espelho Oficial da Medição)', () => {
  it('retorna os dados consolidados do espelho em JSON com cabeçalho e itens', async () => {
    const { data, error } = await empreiteiroAlfa.client.rpc('get_measurement_statement', {
      p_measurement_id: measurementId,
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.id).toBe(measurementId)
    expect(data.protocol).toMatch(/^MED-\d{4}-\d{2}-\d{3}$/)
    expect(data.contractor_name).toBe('Empreiteira Alfa')
    expect(data.project_name).toBe('Residencial Vista Alta')
    expect(data.contract_number).toBe('023/2026')
    expect(Number(data.total_requested)).toBe(40 * 112 + 60 * 90) // 4480 + 5400 = 9880

    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items.length).toBe(2)

    const itemAlvenaria = data.items.find((i: any) => i.service_name === 'Alvenaria')
    expect(itemAlvenaria).toBeDefined()
    expect(Number(itemAlvenaria.qty_requested)).toBe(60)
    expect(Number(itemAlvenaria.unit_price)).toBe(90)
    expect(Number(itemAlvenaria.subtotal_requested)).toBe(5400)
  })

  it('impede que usuário não autorizado acesse o espelho (controle negativo)', async () => {
    const { data, error } = await empreiteiroBeta.client.rpc('get_measurement_statement', {
      p_measurement_id: measurementId,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permissao negada/i)
    expect(data).toBeNull()
  })
})

describe('get_company_measurements (Listagem flexível corporativa)', () => {
  it('permite à construtora filtrar por status', async () => {
    const { data: emAnalise, error: err1 } = await engenheiro.client.rpc('get_company_measurements', {
      p_status: 'EM_ANALISE',
    })
    expect(err1).toBeNull()
    expect(emAnalise.length).toBeGreaterThanOrEqual(1)
    expect(emAnalise[0].id).toBe(measurementId)

    const { data: devolvidas, error: err2 } = await engenheiro.client.rpc('get_company_measurements', {
      p_status: 'DEVOLVIDAS',
    })
    expect(err2).toBeNull()
    expect(devolvidas.length).toBe(0)
  })

  it('não retorna registros para empreiteiro (controle de papel corporativo)', async () => {
    const { data, error } = await empreiteiroAlfa.client.rpc('get_company_measurements', {
      p_status: null,
    })
    expect(error).toBeNull()
    expect(data.length).toBe(0)
  })
})
