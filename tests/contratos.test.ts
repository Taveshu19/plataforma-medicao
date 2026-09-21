import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createCompany, createUser, cleanup, type TestUser } from './helpers/auth'

let empresa: string
let obra: string
let contratoAlfa: string
let contratoBeta: string
let empreiteiroAlfa: TestUser
let engenheiro: TestUser

async function novoContrato(nome: string, numero: string): Promise<string> {
  const [contractor] = await sql<{ id: string }>(
    'insert into contractors (company_id, name) values ($1, $2) returning id',
    [empresa, nome],
  )
  const [contract] = await sql<{ id: string }>(
    `insert into contracts (company_id, project_id, contractor_id, number)
     values ($1, $2, $3, $4) returning id`,
    [empresa, obra, contractor.id, numero],
  )
  return contract.id
}

beforeAll(async () => {
  await cleanup()
  empresa = await createCompany('Construtora Vista')
  const [p] = await sql<{ id: string }>(
    `insert into projects (company_id, name) values ($1, 'Vista Alta') returning id`,
    [empresa],
  )
  obra = p.id

  contratoAlfa = await novoContrato('Empreiteira Alfa', '023/2026')
  contratoBeta = await novoContrato('Empreiteira Beta', '024/2026')

  engenheiro = await createUser('eng@vista.test', empresa, 'engenharia')
  empreiteiroAlfa = await createUser('alfa@alfa.test', empresa, 'empreiteiro')
  const [alfa] = await sql<{ contractor_id: string }>(
    'select contractor_id from contracts where id = $1',
    [contratoAlfa],
  )
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    alfa.contractor_id,
    empreiteiroAlfa.userId,
  ])

  await sql(
    `insert into contract_items
       (company_id, contract_id, service_name, unit, quantity, unit_price)
     values ($1, $2, 'Contrapiso', 'm2', 86, 112),
            ($1, $3, 'Alvenaria', 'm2', 200, 90)`,
    [empresa, contratoAlfa, contratoBeta],
  )
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('acesso a contratos', () => {
  it('engenharia enxerga os contratos de todos os empreiteiros da obra', async () => {
    const { data } = await engenheiro.client.from('contracts').select('id')
    expect(data).toHaveLength(2)
  })

  it('empreiteiro enxerga apenas o proprio contrato', async () => {
    const { data } = await empreiteiroAlfa.client.from('contracts').select('id')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(contratoAlfa)
  })

  it('empreiteiro nao alcanca o contrato do concorrente nem pelo id', async () => {
    const { data } = await empreiteiroAlfa.client
      .from('contracts')
      .select('id')
      .eq('id', contratoBeta)
    expect(data).toEqual([])
  })

  it('empreiteiro nao enxerga os itens do contrato do concorrente', async () => {
    const { data } = await empreiteiroAlfa.client
      .from('contract_items')
      .select('service_name')
    expect(data!.map((i) => i.service_name)).toEqual(['Contrapiso'])
  })
})

describe('modelagem de itens', () => {
  it('aceita item sem local, para empreitada global', async () => {
    const rows = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Mobilizacao', 'pct', 100, 1000) returning id`,
      [empresa, contratoAlfa],
    )
    expect(rows[0].id).toBeTruthy()
  })

  it('recusa quantidade zero ou negativa', async () => {
    await expect(
      sql(
        `insert into contract_items
           (company_id, contract_id, service_name, unit, quantity, unit_price)
         values ($1, $2, 'Invalido', 'm2', 0, 10)`,
        [empresa, contratoAlfa],
      ),
    ).rejects.toThrow()
  })

  it('converte percentual em quantidade sobre o item do local', async () => {
    // Alvenaria: 200 m2 no local. 10% sao 20 m2.
    const [item] = await sql<{ id: string }>(
      `select id from contract_items where contract_id = $1 and service_name = 'Alvenaria'`,
      [contratoBeta],
    )
    const [row] = await sql<{ qty: string }>('select qty_from_percent($1, 10) as qty', [item.id])
    expect(Number(row.qty)).toBe(20)
  })

  it('converte quantidade em percentual no sentido inverso', async () => {
    const [item] = await sql<{ id: string }>(
      `select id from contract_items where contract_id = $1 and service_name = 'Alvenaria'`,
      [contratoBeta],
    )
    const [row] = await sql<{ pct: string }>('select percent_from_qty($1, 20) as pct', [item.id])
    expect(Number(row.pct)).toBe(10)
  })

  it('a conversao ignora o total do contrato e usa so o item do local', async () => {
    // Dois locais do mesmo servico: 200 m2 e 50 m2. 10% de cada da 20 e 5.
    const [outroLocal] = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Alvenaria', 'm2', 50, 90) returning id`,
      [empresa, contratoBeta],
    )
    const [row] = await sql<{ qty: string }>('select qty_from_percent($1, 10) as qty', [
      outroLocal.id,
    ])
    expect(Number(row.qty)).toBe(5)
  })

  it('a obra nasce no modo quantidade', async () => {
    const [row] = await sql<{ measurement_input_mode: string }>(
      'select measurement_input_mode from projects where id = $1',
      [obra],
    )
    expect(row.measurement_input_mode).toBe('quantidade')
  })

  it('item de aditivo convive com o item original do mesmo servico', async () => {
    const [aditivo] = await sql<{ id: string }>(
      `insert into contract_addendums (company_id, contract_id, number)
       values ($1, $2, 'AD-01') returning id`,
      [empresa, contratoAlfa],
    )
    await sql(
      `insert into contract_items
         (company_id, contract_id, addendum_id, service_name, unit, quantity, unit_price)
       values ($1, $2, $3, 'Contrapiso', 'm2', 30, 112)`,
      [empresa, contratoAlfa, aditivo.id],
    )
    const rows = await sql<{ count: string }>(
      `select count(*) from contract_items
       where contract_id = $1 and service_name = 'Contrapiso'`,
      [contratoAlfa],
    )
    expect(Number(rows[0].count)).toBe(2)
  })
})
