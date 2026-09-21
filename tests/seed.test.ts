import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'

/* Este arquivo roda contra o banco recem-resetado, que ja aplicou o seed.
   Nao limpa nada: valida o estado que `supabase db reset` produz. */

beforeAll(async () => {
  const rows = await sql<{ count: string }>('select count(*) from companies')
  if (Number(rows[0].count) === 0) {
    throw new Error('Banco sem seed. Rode `npx supabase db reset` antes deste teste.')
  }
})

afterAll(async () => {
  await closePool()
})

describe('seed de demonstracao', () => {
  it('cria uma construtora com uma obra de 20 casas', async () => {
    const [row] = await sql<{ count: string }>(
      `select count(*) from units u
       join stages s on s.id = u.stage_id
       join projects p on p.id = s.project_id
       where p.name = 'Residencial Vista Alta'`,
    )
    expect(Number(row.count)).toBe(20)
  })

  it('cria dois empreiteiros com contrato', async () => {
    const [row] = await sql<{ count: string }>('select count(*) from contracts')
    expect(Number(row.count)).toBe(2)
  })

  it('cria itens de contrato para todas as casas', async () => {
    const [row] = await sql<{ count: string }>('select count(*) from contract_items')
    expect(Number(row.count)).toBeGreaterThanOrEqual(120) // 20 casas x 6 servicos
  })

  it('tem o periodo corrente aberto', async () => {
    const [row] = await sql<{ count: string }>(
      'select count(*) from measurement_periods where now() between opens_at and closes_at',
    )
    expect(Number(row.count)).toBe(1)
  })

  it('tem historico com medicoes em estados variados', async () => {
    const rows = await sql<{ status: string }>(
      'select distinct status::text as status from measurements',
    )
    const estados = rows.map((r) => r.status)
    expect(estados).toContain('PAGA')
    expect(estados).toContain('APROVADA')
    expect(estados).toContain('EM_ANALISE')
  })

  it('os saldos batem com o historico', async () => {
    const rows = await sql<{ service_name: string; quantity: string; balance: string }>(
      `select ci.service_name, ci.quantity, contract_item_balance(ci.id) as balance
       from contract_items ci
       order by ci.created_at
       limit 20`,
    )
    for (const row of rows) {
      expect(Number(row.balance)).toBeGreaterThanOrEqual(0)
      expect(Number(row.balance)).toBeLessThanOrEqual(Number(row.quantity))
    }
  })

  it('nenhum item de contrato ficou com saldo negativo', async () => {
    const [row] = await sql<{ count: string }>(
      'select count(*) from contract_items ci where contract_item_balance(ci.id) < 0',
    )
    expect(Number(row.count)).toBe(0)
  })
})
