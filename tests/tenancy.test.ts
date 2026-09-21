import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { closePool } from './helpers/db'
import { admin, createCompany, createUser, cleanup, type TestUser } from './helpers/auth'

let empresaA: string
let empresaB: string
let anaDaA: TestUser

beforeAll(async () => {
  await cleanup()
  empresaA = await createCompany('Construtora A')
  empresaB = await createCompany('Construtora B')
  anaDaA = await createUser('ana@a.test', empresaA, 'engenharia')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('isolamento entre construtoras', () => {
  it('usuario enxerga a propria empresa', async () => {
    const { data } = await anaDaA.client.from('companies').select('id, name')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(empresaA)
  })

  it('usuario nao enxerga a empresa vizinha nem consultando pelo id', async () => {
    const { data } = await anaDaA.client
      .from('companies')
      .select('id')
      .eq('id', empresaB)
    expect(data).toEqual([])
  })

  it('usuario so enxerga os proprios vinculos', async () => {
    const outro = await createUser('bruno@b.test', empresaB, 'engenharia')
    const { data } = await anaDaA.client.from('memberships').select('user_id')
    expect(data!.every((row) => row.user_id === anaDaA.userId)).toBe(true)
    expect(data!.some((row) => row.user_id === outro.userId)).toBe(false)
  })

  it('service role enxerga tudo, para o seed funcionar', async () => {
    const { data } = await admin.from('companies').select('id')
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })
})
