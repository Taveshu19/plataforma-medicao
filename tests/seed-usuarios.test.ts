import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.test' })

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!

/* Roda contra o banco recem-resetado, que ja aplicou o seed.
   Nao limpa nada: valida o estado que `supabase db reset` produz. */

beforeAll(async () => {
  const [row] = await sql<{ count: string }>('select count(*) from companies')
  if (Number(row.count) === 0) {
    throw new Error('Banco sem seed. Rode `npx supabase db reset` antes deste teste.')
  }
})

afterAll(async () => {
  await closePool()
})

describe('usuarios de demonstracao', () => {
  it('cria os quatro usuarios com profile', async () => {
    const rows = await sql<{ email: string }>(
      `select u.email from auth.users u
       join profiles p on p.id = u.id
       where u.email like '%@demo.test' order by u.email`,
    )
    expect(rows.map((r) => r.email)).toEqual([
      'alfa@demo.test',
      'beta@demo.test',
      'engenharia@demo.test',
      'gerencia@demo.test',
    ])
  })

  it('vincula cada empreiteiro ao proprio contractor', async () => {
    const rows = await sql<{ email: string; contractor: string }>(
      `select u.email, c.name as contractor
       from auth.users u
       join memberships m on m.user_id = u.id
       join contractors c on c.id = m.contractor_id
       where u.email like '%@demo.test' order by u.email`,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].email).toBe('alfa@demo.test')
    expect(rows[0].contractor).toContain('Alfa')
    expect(rows[1].email).toBe('beta@demo.test')
    expect(rows[1].contractor).toContain('Beta')
  })

  it('engenharia e gerencia tem acesso a empresa toda, sem contractor', async () => {
    const rows = await sql<{ email: string; role: string; contractor_id: string | null }>(
      `select u.email, m.role::text as role, m.contractor_id
       from auth.users u
       join memberships m on m.user_id = u.id
       where u.email in ('engenharia@demo.test', 'gerencia@demo.test')
       order by u.email`,
    )
    expect(rows.map((r) => r.role)).toEqual(['engenharia', 'gerencia'])
    expect(rows.every((r) => r.contractor_id === null)).toBe(true)
  })

  it('os usuarios conseguem autenticar de verdade com a senha do seed', async () => {
    const client = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithPassword({
      email: 'alfa@demo.test',
      password: 'demo1234',
    })
    expect(error).toBeNull()
    expect(data.user?.email).toBe('alfa@demo.test')
  })

  it('o empreiteiro Alfa enxerga apenas o proprio contrato', async () => {
    const client = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await client.auth.signInWithPassword({ email: 'alfa@demo.test', password: 'demo1234' })
    const { data } = await client.from('contracts').select('number')
    expect(data).toHaveLength(1)
    expect(data![0].number).toBe('023/2026')
  })
})
