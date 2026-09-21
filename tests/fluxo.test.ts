import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function estado(id: string): Promise<{ status: string; current_level: number }> {
  const [row] = await sql<{ status: string; current_level: number }>(
    'select status, current_level from measurements where id = $1',
    [id],
  )
  return row
}

async function medicaoPronta(): Promise<string> {
  return createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
}

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
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('envio', () => {
  it('leva a medicao para o nivel 1 e gera protocolo', async () => {
    const id = await medicaoPronta()
    const [row] = await sql<{ protocol: string }>('select submit_measurement($1) as protocol', [id])
    expect(row.protocol).toBe('MED-2026-09-001')
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 1 })
  })

  it('recusa medicao sem nenhum item', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await expect(sql('select submit_measurement($1)', [id])).rejects.toThrow(/nenhum item/i)
  })

  it('recusa envio de medicao que ja esta em analise', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await expect(sql('select submit_measurement($1)', [id])).rejects.toThrow(/nao pode ser enviada/i)
  })
})

describe('aprovacao em cadeia', () => {
  it('avanca um nivel por aprovacao ate o ultimo', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])

    await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 2 })

    await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 3 })

    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('obra de nivel unico aprova de uma vez', async () => {
    await sql('delete from approval_levels where project_id = $1 and level > 1', [s.projectId])
    await sql('update projects set approval_levels = 1 where id = $1', [s.projectId])

    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('obra com incorporadora exige um nivel a mais', async () => {
    await sql(
      `insert into approval_levels (company_id, project_id, level, label, role)
       values ($1, $2, 4, 'Incorporadora', 'incorporadora')`,
      [s.companyId, s.projectId],
    )
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    for (let i = 0; i < 3; i++) await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 4 })
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('recusa aprovacao de medicao que nao esta em analise', async () => {
    const id = await medicaoPronta()
    await expect(sql('select approve_measurement($1)', [id])).rejects.toThrow(/nao esta em analise/i)
  })
})

describe('devolucao', () => {
  it('exige motivo', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await expect(sql('select return_measurement($1, $2)', [id, '  '])).rejects.toThrow(/motivo/i)
  })

  it('devolve para o empreiteiro e zera o nivel', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select return_measurement($1, $2)', [id, 'Fachada da Casa 07 nao confere.'])
    expect(await estado(id)).toEqual({ status: 'DEVOLVIDA', current_level: 0 })
  })

  it('reenvio depois da devolucao recomeca no nivel 1, mesmo se a gerencia devolveu', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).current_level).toBe(3)

    await sql('select return_measurement($1, $2)', [id, 'Revisar quantidades.'])
    await sql('select submit_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 1 })
  })

  it('reenvio preserva o protocolo original', async () => {
    const id = await medicaoPronta()
    const [primeiro] = await sql<{ protocol: string }>(
      'select submit_measurement($1) as protocol', [id],
    )
    await sql('select return_measurement($1, $2)', [id, 'Revisar.'])
    const [segundo] = await sql<{ protocol: string }>(
      'select submit_measurement($1) as protocol', [id],
    )
    expect(segundo.protocol).toBe(primeiro.protocol)
  })
})

describe('isolamento por RLS em approval_levels', () => {
  it('usuario enxerga apenas niveis de aprovacao das suas obras (controle negativo)', async () => {
    const { createScopedUser } = await import('./helpers/auth')
    // Cria uma segunda obra com seus proprios niveis
    const [project2] = await sql<{ id: string }>(
      `insert into projects (company_id, name, unit_label, approval_levels)
       values ($1, 'Residencial Sul', 'apartamento', 1) returning id`,
      [s.companyId],
    )
    await sql(
      `insert into approval_levels (company_id, project_id, level, label, role)
       values ($1, $2, 1, 'Engenharia Sul', 'engenharia')`,
      [s.companyId, project2.id],
    )

    // Usuario escopado a primeira obra
    const eng1 = await createScopedUser('eng1@vista.com.br', s.companyId, s.projectId, 'engenharia')
    const { data: levels, error } = await eng1.client
      .from('approval_levels')
      .select('label, project_id')
    expect(error).toBeNull()
    expect(levels).toHaveLength(3)
    expect(levels!.every((l) => l.project_id === s.projectId)).toBe(true)
    // Controle negativo: nenhum nivel da obra 2 e visivel
    expect(levels!.some((l) => l.project_id === project2.id)).toBe(false)
  })
})

describe('integracao com regra de saldo no envio', () => {
  it('recusa submit_measurement se a promocao exceder o saldo restante', async () => {
    // Helper para criar medicao em periodo novo
    const [period2] = await sql<{ id: string }>(
      `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
       values ($1, $2, '2026-10-01', now() - interval '1 day', now() + interval '9 days') returning id`,
      [s.companyId, s.projectId],
    )
    // Rascunho A: 60 m2 (saldo total 86)
    const idA = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 60 },
    ])
    // Rascunho B no mes seguinte: 60 m2 (aceito como rascunho pois A ainda nao consome)
    const [mB] = await sql<{ id: string }>(
      `insert into measurements (company_id, period_id, contract_id, status)
       values ($1, $2, $3, 'RASCUNHO') returning id`,
      [s.companyId, period2.id, s.contractId],
    )
    await sql(
      `insert into measurement_items (company_id, measurement_id, contract_item_id, qty_requested)
       values ($1, $2, $3, 60)`,
      [s.companyId, mB.id, s.contrapisoId],
    )

    // Envia A com sucesso: consome 60, restam 26
    await sql('select submit_measurement($1)', [idA])
    expect((await estado(idA)).status).toBe('EM_ANALISE')

    // Tenta enviar B: precisa de 60, mas so restam 26 -> deve ser recusado
    await expect(sql('select submit_measurement($1)', [mB.id])).rejects.toThrow(
      /Quantidade acima do saldo disponivel para Contrapiso\. O maximo permitido e 26/,
    )
    // B deve continuar como RASCUNHO
    expect((await estado(mB.id)).status).toBe('RASCUNHO')
  })
})

describe('validacoes defensivas', () => {
  it('recusa submit_measurement de id inexistente', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await expect(sql('select submit_measurement($1)', [fakeId])).rejects.toThrow(/nao encontrada/i)
  })

  it('recusa aprovacao quando a obra nao tem niveis configurados', async () => {
    await sql('delete from approval_levels where project_id = $1', [s.projectId])
    const id = await medicaoPronta()
    // Forca status EM_ANALISE direto
    await sql(`update measurements set status = 'EM_ANALISE', current_level = 1 where id = $1`, [id])
    await expect(sql('select approve_measurement($1)', [id])).rejects.toThrow(/sem niveis de aprovacao/i)
  })
})

