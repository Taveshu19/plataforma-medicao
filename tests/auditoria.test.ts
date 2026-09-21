import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createScopedUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let medicao: string

interface Entrada {
  action: string
  old_value: string | null
  new_value: string | null
  level: number | null
  reason: string | null
}

async function trilha(): Promise<Entrada[]> {
  return sql<Entrada>(
    `select action, old_value, new_value, level, reason
     from audit_log where measurement_id = $1 order by created_at, id`,
    [medicao],
  )
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role) values
       ($1, $2, 1, 'Engenharia', 'engenharia'),
       ($1, $2, 2, 'Gerencia',   'gerencia')`,
    [s.companyId, s.projectId],
  )
  medicao = await createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('trilha de auditoria', () => {
  it('registra o envio', async () => {
    await sql('select submit_measurement($1)', [medicao])
    const entradas = await trilha()
    expect(entradas.some((e) => e.action === 'ENVIADA')).toBe(true)
  })

  it('registra o ajuste de quantidade com valor anterior e novo', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql(
      `update measurement_items set qty_approved = 18
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    const ajuste = (await trilha()).find((e) => e.action === 'QUANTIDADE_AJUSTADA')
    expect(ajuste).toBeDefined()
    expect(Number(ajuste!.old_value)).toBe(20)
    expect(Number(ajuste!.new_value)).toBe(18)
    expect(ajuste!.level).toBe(1)
  })

  it('registra o nivel correto quando quem ajusta e a gerencia', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    await sql(
      `update measurement_items set qty_approved = 15
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    const ajuste = (await trilha()).filter((e) => e.action === 'QUANTIDADE_AJUSTADA').pop()
    expect(ajuste!.level).toBe(2)
  })

  it('registra a devolucao com o motivo', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select return_measurement($1, $2)', [medicao, 'Fachada nao confere.'])
    const devolucao = (await trilha()).find((e) => e.action === 'DEVOLVIDA')
    expect(devolucao!.reason).toBe('Fachada nao confere.')
  })

  it('registra cada aprovacao da cadeia', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    const aprovacoes = (await trilha()).filter((e) => e.action === 'APROVADA')
    expect(aprovacoes).toHaveLength(2)
  })

  it('a quantidade solicitada sobrevive intacta a varios ajustes', async () => {
    await sql('select submit_measurement($1)', [medicao])
    for (const q of [18, 16, 19]) {
      await sql(
        `update measurement_items set qty_approved = $3
         where measurement_id = $1 and contract_item_id = $2`,
        [medicao, s.contrapisoId, q],
      )
    }
    const [item] = await sql<{ qty_requested: string; qty_approved: string }>(
      `select qty_requested, qty_approved from measurement_items
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    expect(Number(item.qty_requested)).toBe(20)
    expect(Number(item.qty_approved)).toBe(19)
    expect((await trilha()).filter((e) => e.action === 'QUANTIDADE_AJUSTADA')).toHaveLength(3)
  })
})

describe('isolamento RLS de audit_log (controle negativo)', () => {
  it('usuario escopado a outra obra nao enxerga a trilha de auditoria desta medicao', async () => {
    await sql('select submit_measurement($1)', [medicao])

    // Obra 2 e engenheiro escopado a ela
    const [proj2] = await sql<{ id: string }>(
      `insert into projects (company_id, name, unit_label, approval_levels)
       values ($1, 'Obra Outra', 'casa', 1) returning id`,
      [s.companyId],
    )
    const eng2 = await createScopedUser('eng2@vista.com.br', s.companyId, proj2.id, 'engenharia')

    // Engenheiro da obra 1 (com acesso a medicao)
    const eng1 = await createScopedUser('eng1@vista.com.br', s.companyId, s.projectId, 'engenharia')

    const { data: logs1, error: err1 } = await eng1.client
      .from('audit_log')
      .select('action, measurement_id')
      .eq('measurement_id', medicao)
    expect(err1).toBeNull()
    expect(logs1!.length).toBeGreaterThan(0)

    // Controle negativo: eng2 nao ve nada
    const { data: logs2, error: err2 } = await eng2.client
      .from('audit_log')
      .select('action, measurement_id')
      .eq('measurement_id', medicao)
    expect(err2).toBeNull()
    expect(logs2).toEqual([])
  })
})
