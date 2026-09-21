import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createCompany } from './helpers/auth'
import { buildScenario } from './helpers/scenario'

/**
 * A limpeza dos testes já derrubou a demonstração duas vezes: dava
 * `truncate companies cascade` e apagava todos os usuários do Auth. Quem
 * abrisse o link nesse intervalo não conseguia nem entrar.
 *
 * Estes testes existem para que isso não volte a acontecer em silêncio.
 * Eles rodam na suíte principal de propósito — é ela que chama `cleanup()`.
 */

beforeAll(async () => {
  const [linha] = await sql<{ count: string }>(
    'select count(*) from companies where is_demo',
  )
  if (Number(linha.count) === 0) {
    throw new Error(
      'Banco sem dados de demonstracao. Rode `npx supabase db reset` antes desta suite.',
    )
  }
})

afterAll(async () => {
  await closePool()
})

describe('a limpeza dos testes preserva a demonstração', () => {
  it('a empresa de demonstração sobrevive a um cleanup', async () => {
    await cleanup()
    const [linha] = await sql<{ count: string }>(
      'select count(*) from companies where is_demo',
    )
    expect(Number(linha.count)).toBe(1)
  })

  it('os usuários de demonstração sobrevivem a um cleanup', async () => {
    await cleanup()
    const linhas = await sql<{ email: string }>(
      `select email from auth.users where email like '%@demo.test' order by email`,
    )
    expect(linhas.map((l) => l.email)).toEqual([
      'alfa@demo.test',
      'beta@demo.test',
      'engenharia@demo.test',
      'gerencia@demo.test',
    ])
  })

  it('o contrato e os itens da demonstração continuam de pé', async () => {
    await cleanup()
    const [linha] = await sql<{ count: string }>(
      `select count(*) from contract_items ci
       join contracts c on c.id = ci.contract_id
       join companies e on e.id = c.company_id
       where e.is_demo`,
    )
    expect(Number(linha.count)).toBeGreaterThan(0)
  })

  it('mas os dados criados pelos testes são de fato removidos', async () => {
    const empresaDeTeste = await createCompany('Construtora Descartavel')
    const [antes] = await sql<{ count: string }>(
      'select count(*) from companies where id = $1',
      [empresaDeTeste],
    )
    expect(Number(antes.count)).toBe(1)

    await cleanup()

    const [depois] = await sql<{ count: string }>(
      'select count(*) from companies where id = $1',
      [empresaDeTeste],
    )
    expect(Number(depois.count)).toBe(0)
  })

  it('um cenário de teste inteiro é removido, com obra e contrato juntos', async () => {
    const s = await buildScenario()
    const [antes] = await sql<{ count: string }>(
      'select count(*) from contract_items where contract_id = $1',
      [s.contractId],
    )
    expect(Number(antes.count)).toBeGreaterThan(0)

    await cleanup()

    const [depois] = await sql<{ count: string }>(
      'select count(*) from contract_items where contract_id = $1',
      [s.contractId],
    )
    expect(Number(depois.count)).toBe(0)
  })
})
