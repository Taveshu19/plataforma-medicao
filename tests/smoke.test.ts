import { describe, it, expect, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'

afterAll(async () => {
  await closePool()
})

describe('stack local', () => {
  it('conecta no Postgres do Supabase', async () => {
    const rows = await sql<{ ok: number }>('select 1 as ok')
    expect(rows[0].ok).toBe(1)
  })

  it('tem a extensao pgcrypto para gen_random_uuid', async () => {
    const rows = await sql<{ id: string }>('select gen_random_uuid() as id')
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
