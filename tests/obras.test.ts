import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createCompany, createUser, createScopedUser, cleanup, type TestUser } from './helpers/auth'

let empresa: string
let obraNorte: string
let obraSul: string
let gerente: TestUser
let incorporadora: TestUser

beforeAll(async () => {
  await cleanup()
  empresa = await createCompany('Construtora Vista')

  const obras = await sql<{ id: string; name: string }>(
    `insert into projects (company_id, name, unit_label)
     values ($1, 'Residencial Norte', 'casa'), ($1, 'Residencial Sul', 'apartamento')
     returning id, name`,
    [empresa],
  )
  obraNorte = obras.find((o) => o.name === 'Residencial Norte')!.id
  obraSul = obras.find((o) => o.name === 'Residencial Sul')!.id

  gerente = await createUser('gerente@vista.test', empresa, 'gerencia')
  incorporadora = await createScopedUser('inc@externa.test', empresa, obraNorte, 'incorporadora')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('escopo de acesso por obra', () => {
  it('usuario da empresa enxerga todas as obras dela', async () => {
    const { data } = await gerente.client.from('projects').select('id')
    expect(data).toHaveLength(2)
  })

  it('aprovador externo enxerga somente a obra vinculada', async () => {
    const { data } = await incorporadora.client.from('projects').select('id, name')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(obraNorte)
  })

  it('aprovador externo nao alcanca a outra obra nem pelo id', async () => {
    const { data } = await incorporadora.client
      .from('projects')
      .select('id')
      .eq('id', obraSul)
    expect(data).toEqual([])
  })

  it('o rotulo do local e configuravel por obra', async () => {
    const { data } = await gerente.client
      .from('projects')
      .select('name, unit_label')
      .order('name')
    expect(data!.map((p) => p.unit_label)).toEqual(['casa', 'apartamento'])
  })

  it('a obra nasce com tres niveis de aprovacao', async () => {
    const rows = await sql<{ approval_levels: number }>(
      'select approval_levels from projects where id = $1',
      [obraNorte],
    )
    expect(rows[0].approval_levels).toBe(3)
  })
})
