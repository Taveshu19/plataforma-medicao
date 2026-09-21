import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
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

describe('isolamento de profiles', () => {
  it('usuario le o proprio profile e nao alcanca o de outro usuario nem por id', async () => {
    const outro = await createUser('carla@a.test', empresaA, 'engenharia')

    const { data } = await anaDaA.client.from('profiles').select('id')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(anaDaA.userId)

    const { data: alheio } = await anaDaA.client
      .from('profiles')
      .select('id')
      .eq('id', outro.userId)
    expect(alheio).toEqual([])
  })
})

describe('usuario com vinculo em mais de uma construtora', () => {
  it('enxerga as duas empresas vinculadas e continua sem enxergar uma terceira', async () => {
    const empresaC = await createCompany('Construtora C')
    const empreiteiro = await createUser('empreiteiro@duplo.test', empresaA, 'empreiteiro')
    await sql(
      'insert into memberships (user_id, company_id, role) values ($1, $2, $3)',
      [empreiteiro.userId, empresaB, 'empreiteiro'],
    )

    const { data } = await empreiteiro.client.from('companies').select('id')
    const ids = data!.map((row) => row.id)

    expect(ids).toEqual(expect.arrayContaining([empresaA, empresaB]))
    expect(ids).not.toContain(empresaC)
    expect(ids).toHaveLength(2)
  })
})
