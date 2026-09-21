import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiroAlfa: TestUser
let usuarioGerencia: TestUser

async function prepararMedicaoAprovada(): Promise<string> {
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

  usuarioGerencia = await createUser('gerencia@test.com', s.companyId, 'gerencia')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('consultas de faturamento (get_measurement_invoice_details e get_pending_invoices)', () => {
  it('retorna os detalhes da medicao aprovada para o empreiteiro emitir NF', async () => {
    const medId = await prepararMedicaoAprovada()

    const { data, error } = await empreiteiroAlfa.client.rpc(
      'get_measurement_invoice_details',
      {
        p_measurement_id: medId,
      },
    )

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data.measurement.id).toBe(medId)
    expect(data.measurement.status).toBe('APROVADA')
    expect(data.measurement.approvedAmount).toBe(2016)
    expect(data.invoice).toBeNull()
  })

  it('lista faturamentos pendentes para a construtora', async () => {
    const medId = await prepararMedicaoAprovada()
    await empreiteiroAlfa.client.rpc('submit_invoice', {
      p_measurement_id: medId,
      p_number: 'NF-9988',
      p_issued_on: '2026-09-20',
      p_amount: 2016,
    })

    const { data: lista, error } = await usuarioGerencia.client.rpc('get_pending_invoices')
    expect(error).toBeNull()
    expect(lista).toHaveLength(1)
    expect(lista[0].invoice_number).toBe('NF-9988')
    expect(lista[0].measurement_status).toBe('NF_ENVIADA')
    expect(Number(lista[0].invoice_amount)).toBe(2016)
  })
})
