import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

interface ResumoServico {
  service_name: string
  unit: string
  total_quantity: string
  measured_quantity: string
  balance_quantity: string
  total_amount: string
  measured_amount: string
  balance_amount: string
  locations: string
}

async function resumoServicos(): Promise<ResumoServico[]> {
  return sql<ResumoServico>('select * from get_contract_services_summary($1)', [s.contractId])
}

async function porNome(nome: string): Promise<ResumoServico> {
  const linhas = await resumoServicos()
  const achado = linhas.find((l) => l.service_name === nome)
  if (!achado) throw new Error(`servico ${nome} nao encontrado no resumo`)
  return achado
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('resumo por servico do contrato', () => {
  it('sem medicao, o saldo de cada servico e a quantidade total', async () => {
    // Cenario: Contrapiso 86 m2 a R$ 112 ; Alvenaria 200 m2 a R$ 90
    const contrapiso = await porNome('Contrapiso')
    expect(Number(contrapiso.total_quantity)).toBe(86)
    expect(Number(contrapiso.measured_quantity)).toBe(0)
    expect(Number(contrapiso.balance_quantity)).toBe(86)
    expect(Number(contrapiso.total_amount)).toBe(9632)
    expect(Number(contrapiso.balance_amount)).toBe(9632)
  })

  it('soma o mesmo servico espalhado por varias casas', async () => {
    // Acrescenta Contrapiso num segundo local, com a mesma unidade
    const [etapa] = await sql<{ id: string }>(
      'select stage_id as id from units where id = $1',
      [s.unitId],
    )
    const [outroLocal] = await sql<{ id: string }>(
      `insert into units (company_id, stage_id, name, position)
       values ($1, $2, 'Casa 02', 2) returning id`,
      [s.companyId, etapa.id],
    )
    await sql(
      `insert into contract_items
         (company_id, contract_id, unit_id, service_name, unit, quantity, unit_price)
       values ($1, $2, $3, 'Contrapiso', 'm2', 50, 112)`,
      [s.companyId, s.contractId, outroLocal.id],
    )

    const contrapiso = await porNome('Contrapiso')
    expect(Number(contrapiso.total_quantity)).toBe(136) // 86 + 50
    expect(Number(contrapiso.total_amount)).toBe(15232) // 136 x 112
    expect(Number(contrapiso.locations)).toBe(2)
  })

  it('medicao aprovada entra como medido e reduz o saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    const contrapiso = await porNome('Contrapiso')
    expect(Number(contrapiso.measured_quantity)).toBe(20)
    expect(Number(contrapiso.balance_quantity)).toBe(66)
    expect(Number(contrapiso.measured_amount)).toBe(2240) // 20 x 112
    expect(Number(contrapiso.balance_amount)).toBe(7392) // 66 x 112
  })

  it('rascunho nao conta como medido', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const contrapiso = await porNome('Contrapiso')
    expect(Number(contrapiso.measured_quantity)).toBe(0)
    expect(Number(contrapiso.balance_quantity)).toBe(86)
  })

  it('medido mais saldo sempre fecha com o total, em quantidade e em valor', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 30 },
      { contractItemId: s.alvenariaId, requested: 40 },
    ])
    for (const linha of await resumoServicos()) {
      expect(Number(linha.measured_quantity) + Number(linha.balance_quantity)).toBeCloseTo(
        Number(linha.total_quantity),
        4,
      )
      expect(Number(linha.measured_amount) + Number(linha.balance_amount)).toBeCloseTo(
        Number(linha.total_amount),
        2,
      )
    }
  })

  it('nao mistura o mesmo servico em unidades diferentes', async () => {
    await sql(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Contrapiso', 'vb', 1, 5000)`,
      [s.companyId, s.contractId],
    )
    const linhas = (await resumoServicos()).filter((l) => l.service_name === 'Contrapiso')
    expect(linhas).toHaveLength(2)
    expect(linhas.map((l) => l.unit).sort()).toEqual(['m2', 'vb'])
  })
})

describe('progresso da medicao corrente', () => {
  interface Progresso {
    measurement_id: string
    status: string
    current_level: number
    protocol: string | null
    competence: string
    invoice_status: string | null
    expected_payment_date: string | null
  }

  async function progresso(): Promise<Progresso | undefined> {
    const linhas = await sql<Progresso>(
      'select * from get_current_measurement_progress($1)',
      [s.contractId],
    )
    return linhas[0]
  }

  it('sem medicao nenhuma, nao devolve linha', async () => {
    expect(await progresso()).toBeUndefined()
  })

  it('devolve o status e o nivel da medicao viva', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(`update measurements set current_level = 2 where contract_id = $1`, [
      s.contractId,
    ])
    const p = await progresso()
    expect(p?.status).toBe('EM_ANALISE')
    expect(p?.current_level).toBe(2)
  })

  it('ignora medicao cancelada', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    expect(await progresso()).toBeUndefined()
  })

  it('traz a data prevista de pagamento quando o financeiro informa', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await sql(
      `insert into invoices
         (company_id, measurement_id, number, issued_on, amount, expected_payment_date)
       values ($1, $2, '7001', '2026-09-20', 2240, '2026-10-15')`,
      [s.companyId, id],
    )
    const p = await progresso()
    expect(p?.invoice_status).toBe('RECEBIDA')
    // O driver devolve `date` como objeto Date no fuso local, nao como string.
    const prevista = new Date(p!.expected_payment_date!)
    expect(
      [
        prevista.getFullYear(),
        String(prevista.getMonth() + 1).padStart(2, '0'),
        String(prevista.getDate()).padStart(2, '0'),
      ].join('-'),
    ).toBe('2026-10-15')
  })
})
