import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createScopedUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function medicaoAprovada(): Promise<string> {
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
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('total da medicao', () => {
  it('soma o solicitado quando pedido o total solicitado', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
      { contractItemId: s.alvenariaId, requested: 30 },
    ])
    const [row] = await sql<{ total: string }>(
      'select measurement_total($1, false) as total',
      [id],
    )
    // 20 x 112 + 30 x 90 = 2240 + 2700
    expect(Number(row.total)).toBe(4940)
  })

  it('soma o aprovado quando pedido o total aprovado', async () => {
    const id = await medicaoAprovada()
    const [row] = await sql<{ total: string }>(
      'select measurement_total($1, true) as total',
      [id],
    )
    expect(Number(row.total)).toBe(2016) // 18 x 112
  })
})

describe('nota fiscal', () => {
  it('aceita NF com valor igual ao aprovado', async () => {
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id,
      '1234',
      '2026-09-15',
      2016,
      'nf/1234.pdf',
      'nf/1234.xml',
    ])
    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [id],
    )
    expect(m.status).toBe('NF_ENVIADA')
  })

  it('recusa NF divergente quando a obra nao tolera diferenca', async () => {
    const id = await medicaoAprovada()
    await expect(
      sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
        id,
        '1234',
        '2026-09-15',
        2500,
        'nf/1234.pdf',
        null,
      ]),
    ).rejects.toThrow(/2016/)
  })

  it('aceita divergencia dentro da tolerancia configurada', async () => {
    await sql('update projects set invoice_tolerance = 10 where id = $1', [s.projectId])
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id,
      '1234',
      '2026-09-15',
      2020,
      'nf/1234.pdf',
      null,
    ])
    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1',
      [id],
    )
    expect(m.status).toBe('NF_ENVIADA')
  })

  it('recusa NF de medicao que nao foi aprovada', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
        id,
        '1234',
        '2026-09-15',
        100,
        'nf/1234.pdf',
        null,
      ]),
    ).rejects.toThrow(/aprovada/i)
  })

  it('registra o envio da NF na auditoria', async () => {
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id,
      '1234',
      '2026-09-15',
      2016,
      'nf/1234.pdf',
      null,
    ])
    const rows = await sql<{ action: string }>(
      `select action from audit_log where measurement_id = $1 and action = 'NF_ENVIADA'`,
      [id],
    )
    expect(rows).toHaveLength(1)
  })
})

describe('anexos', () => {
  it('guarda o caminho do arquivo com a empresa no prefixo', async () => {
    const id = await medicaoAprovada()
    const caminho = `${s.companyId}/medicoes/${id}/foto.jpg`
    await sql(
      `insert into attachments (company_id, measurement_id, bucket, path, mime_type, size_bytes)
       values ($1, $2, 'medicao-fotos', $3, 'image/jpeg', 120000)`,
      [s.companyId, id, caminho],
    )
    const [row] = await sql<{ path: string }>(
      'select path from attachments where measurement_id = $1',
      [id],
    )
    expect(row.path.startsWith(s.companyId)).toBe(true)
  })
})

describe('isolamento RLS (controle negativo)', () => {
  it('usuario de outra obra nao ve invoices nem attachments da medicao', async () => {
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id,
      '1234',
      '2026-09-15',
      2016,
      'nf/1234.pdf',
      null,
    ])
    const caminho = `${s.companyId}/medicoes/${id}/foto.jpg`
    await sql(
      `insert into attachments (company_id, measurement_id, bucket, path, mime_type, size_bytes)
       values ($1, $2, 'medicao-fotos', $3, 'image/jpeg', 120000)`,
      [s.companyId, id, caminho],
    )

    const [proj2] = await sql<{ id: string }>(
      `insert into projects (company_id, name, unit_label, approval_levels)
       values ($1, 'Obra Outra', 'casa', 1) returning id`,
      [s.companyId],
    )
    const engProj1 = await createScopedUser('eng1@vista.com.br', s.companyId, s.projectId, 'engenharia')
    const engProj2 = await createScopedUser('eng2@vista.com.br', s.companyId, proj2.id, 'engenharia')

    // engProj1 can see invoice and attachment
    const { data: inv1, error: errInv1 } = await engProj1.client
      .from('invoices')
      .select('number, amount')
      .eq('measurement_id', id)
    expect(errInv1).toBeNull()
    expect(inv1).toHaveLength(1)

    const { data: att1, error: errAtt1 } = await engProj1.client
      .from('attachments')
      .select('path')
      .eq('measurement_id', id)
    expect(errAtt1).toBeNull()
    expect(att1).toHaveLength(1)

    // Negative control: engProj2 cannot see them
    const { data: inv2, error: errInv2 } = await engProj2.client
      .from('invoices')
      .select('number, amount')
      .eq('measurement_id', id)
    expect(errInv2).toBeNull()
    expect(inv2).toEqual([])

    const { data: att2, error: errAtt2 } = await engProj2.client
      .from('attachments')
      .select('path')
      .eq('measurement_id', id)
    expect(errAtt2).toBeNull()
    expect(att2).toEqual([])
  })
})
