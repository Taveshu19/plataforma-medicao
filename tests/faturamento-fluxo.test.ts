import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, createScopedUser, type TestUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiroAlfa: TestUser
let empreiteiroBeta: TestUser
let usuarioGerencia: TestUser

async function prepararMedicaoAprovada(valorAprovado: number = 2016): Promise<string> {
  const id = await createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
  await sql('select submit_measurement($1)', [id])
  await sql(
    `update measurement_items set qty_approved = 18
     where measurement_id = $1 and contract_item_id = $2`,
    [id, s.contrapisoId],
  )
  await sql('select approve_measurement($1)', [id])
  return id
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role)
     values ($1, $2, 1, 'Engenharia', 'engenharia')`,
    [s.companyId, s.projectId],
  )

  empreiteiroAlfa = await createUser('alfa@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiroAlfa.userId,
  ])

  const [contractorBeta] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Beta Construcoes') returning id`,
    [s.companyId],
  )
  empreiteiroBeta = await createUser('beta@test.com', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    contractorBeta.id,
    empreiteiroBeta.userId,
  ])

  usuarioGerencia = await createUser('gerencia@test.com', s.companyId, 'gerencia')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('envio de nota fiscal (submit_invoice)', () => {
  it('empreiteiro envia NF com valor exato e transiciona para NF_ENVIADA', async () => {
    const medId = await prepararMedicaoAprovada(2016)

    const { data: invId, error } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1001',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
      p_pdf: `${s.companyId}/notas/${medId}/nf-1001.pdf`,
      p_xml: null,
    })

    expect(error).toBeNull()
    expect(invId).toBeTruthy()

    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [medId],
    )
    expect(m.status).toBe('NF_ENVIADA')

    const [inv] = await sql<{ status: string; number: string; amount: string }>(
      'select status, number, amount from invoices where id = $1',
      [invId],
    )
    expect(inv.status).toBe('RECEBIDA')
    expect(inv.number).toBe('NF-1001')
    expect(Number(inv.amount)).toBe(2016)

    // Auditoria
    const logs = await sql<{ action: string }>(
      `select action from audit_log where measurement_id = $1 and action = 'NF_ENVIADA'`,
      [medId],
    )
    expect(logs).toHaveLength(1)
  })

  it('recusa NF se valor divergir fora da tolerancia da obra', async () => {
    const medId = await prepararMedicaoAprovada(2016)

    const { error } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1002',
      p_issued_on: '2026-09-20',
      p_amount: 2500,
      p_pdf: null,
      p_xml: null,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/diverge do valor aprovado/i)
  })

  it('aceita pequena divergencia se estiver dentro da tolerancia configurada', async () => {
    await sql('update projects set invoice_tolerance = 15 where id = $1', [s.projectId])
    const medId = await prepararMedicaoAprovada(2016)

    const { data: invId, error } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1003',
      p_issued_on: '2026-09-20',
      p_amount: 2025, // 9 de diferenca <= 15
      p_pdf: null,
      p_xml: null,
    })

    expect(error).toBeNull()
    expect(invId).toBeTruthy()
  })

  it('recusa envio de NF se medicao nao estiver em status APROVADA', async () => {
    const medId = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 10 },
    ])

    const { error } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1004',
      p_issued_on: '2026-09-20',
      p_amount: 1120,
      p_pdf: null,
      p_xml: null,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/status atual: RASCUNHO/i)
  })

  it('impede que outro empreiteiro envie NF para este contrato (RLS)', async () => {
    const medId = await prepararMedicaoAprovada(2016)

    const { error } = await empreiteiroBeta.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-HACK',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
      p_pdf: null,
      p_xml: null,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permissao negada/i)
  })
})

describe('conferencia, rejeicao e aprovacao da NF', () => {
  it('usuario da construtora aprova a nota fiscal e avanca para NF_APROVADA', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1005',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { error } = await usuarioGerencia.client.rpc('approve_invoice', {
      p_invoice_id: invId,
    })
    expect(error).toBeNull()

    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [medId],
    )
    expect(m.status).toBe('NF_APROVADA')

    const [inv] = await sql<{ status: string }>(
      'select status from invoices where id = $1',
      [invId],
    )
    expect(inv.status).toBe('APROVADA')
  })

  it('rejeicao com motivo volta medicao para APROVADA e nota vira REJEITADA', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1006',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { error } = await usuarioGerencia.client.rpc('reject_invoice', {
      p_invoice_id: invId,
      p_reason: 'CNPJ do tomador incorreto',
    })
    expect(error).toBeNull()

    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [medId],
    )
    expect(m.status).toBe('APROVADA')

    const [inv] = await sql<{ status: string }>(
      'select status from invoices where id = $1',
      [invId],
    )
    expect(inv.status).toBe('REJEITADA')

    // Empreiteiro consegue reenviar com número novo
    const { data: novoInvId, error: errReenvio } = await empreiteiroAlfa.client.rpc(
      'submit_invoice',
      {
        p_measurement_id: medId,
        p_number: 'NF-1007',
        p_issued_on: '2026-09-21',
        p_amount: 2016,
      },
    )
    expect(errReenvio).toBeNull()
    expect(novoInvId).toBeTruthy()
  })

  it('exige motivo na rejeicao da nota fiscal', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1008',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { error } = await usuarioGerencia.client.rpc('reject_invoice', {
      p_invoice_id: invId,
      p_reason: '   ',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/obrigatorio/i)
  })

  it('empreiteiro nao consegue aprovar a propria nota fiscal', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1009',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { error } = await empreiteiroAlfa.client.rpc('approve_invoice', {
      p_invoice_id: invId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/sem permissao/i)
  })
})

describe('liquidacao financeira (pay_invoice)', () => {
  it('marca a nota e a medicao como PAGA', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1010',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    await usuarioGerencia.client.rpc('approve_invoice', { p_invoice_id: invId })

    const { error } = await usuarioGerencia.client.rpc('pay_invoice', {
      p_invoice_id: invId,
    })
    expect(error).toBeNull()

    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [medId],
    )
    expect(m.status).toBe('PAGA')

    const [inv] = await sql<{ status: string }>(
      'select status from invoices where id = $1',
      [invId],
    )
    expect(inv.status).toBe('PAGA')
  })

  it('recusa liquidar pagamento se a nota nao estiver aprovada', async () => {
    const medId = await prepararMedicaoAprovada(2016)
    const { data: invId } = await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-1011',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { error } = await usuarioGerencia.client.rpc('pay_invoice', {
      p_invoice_id: invId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/precisa estar aprovada antes do pagamento/i)
  })
})
