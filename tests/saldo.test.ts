import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function saldo(itemId: string, excluir?: string): Promise<number> {
  const [row] = await sql<{ balance: string }>(
    'select contract_item_balance($1, $2) as balance',
    [itemId, excluir ?? null],
  )
  return Number(row.balance)
}

/**
 * Cria uma medicao em um NOVO periodo do mesmo contrato.
 *
 * `measurements_one_active` (migration 005) permite no maximo uma medicao
 * viva por par (period_id, contract_id). Testes que simulam "uma medicao ja
 * aprovada e agora tenta-se medir de novo" representam, no mundo real, uma
 * competencia (periodo) seguinte — nao uma segunda medicao no mesmo periodo.
 * Este helper cria esse periodo seguinte para poder exercitar o saldo
 * acumulado do contrato sem esbarrar na constraint de periodo anterior.
 */
async function createMeasurementInNewPeriod(
  scenario: Scenario,
  competence: string,
  status: string,
  items: Array<{ contractItemId: string; requested: number; approved?: number }>,
): Promise<string> {
  const [period] = await sql<{ id: string }>(
    `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
     values ($1, $2, $3::date, $3::date, $3::date + interval '9 days')
     returning id`,
    [scenario.companyId, scenario.projectId, competence],
  )
  const [m] = await sql<{ id: string }>(
    `insert into measurements (company_id, period_id, contract_id, status)
     values ($1, $2, $3, $4::measurement_status) returning id`,
    [scenario.companyId, period.id, scenario.contractId, status],
  )
  for (const item of items) {
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
       values ($1, $2, $3, $4, $5)`,
      [scenario.companyId, m.id, item.contractItemId, item.requested, item.approved ?? null],
    )
  }
  return m.id
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('calculo de saldo', () => {
  it('sem medicao alguma, o saldo e a quantidade contratada', async () => {
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('rascunho nao consome saldo', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao em analise consome pelo solicitado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
  })

  it('medicao em analise ja ajustada consome pelo aprovado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao aprovada consome pelo aprovado', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao devolvida devolve o saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao cancelada devolve o saldo', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicoes ja pagas continuam consumindo saldo', async () => {
    await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 40, approved: 40 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(46)
  })

  it('excluir uma medicao do calculo ignora o consumo dela', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId, id)).toBe(86)
  })

  it('saldos de itens diferentes nao se misturam', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    expect(await saldo(s.alvenariaId)).toBe(200)
  })
})

describe('bloqueio de saldo', () => {
  it('recusa medicao acima do saldo e informa o maximo permitido', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    await expect(
      createMeasurementInNewPeriod(s, '2026-10-01', 'RASCUNHO', [
        { contractItemId: s.contrapisoId, requested: 20 },
      ]),
    ).rejects.toThrow(/maximo permitido e 16/)
  })

  it('aceita medicao exatamente igual ao saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    const id = await createMeasurementInNewPeriod(s, '2026-10-01', 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 16 },
    ])
    expect(id).toBeTruthy()
  })

  it('aprovador pode aumentar a quantidade dentro do saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(
      `update measurement_items set qty_approved = 30
       where measurement_id = $1 and contract_item_id = $2`,
      [id, s.contrapisoId],
    )
    expect(await saldo(s.contrapisoId)).toBe(56)
  })

  it('aprovador nao pode aumentar alem do saldo do item', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      sql(
        `update measurement_items set qty_approved = 100
         where measurement_id = $1 and contract_item_id = $2`,
        [id, s.contrapisoId],
      ),
    ).rejects.toThrow(/maximo permitido e 86/)
  })
})

/* Rodada de correcao 1: o trigger de 006 vivia so em measurement_items,
   entao uma medicao podia acumular itens como RASCUNHO (nao consome) e so
   depois ter o status promovido via UPDATE em measurements.status -- update
   que nao toca measurement_items e portanto nao disparava checagem
   nenhuma. Ver migration 007_saldo_na_transicao.sql. */
describe('revalidacao de saldo na transicao de status', () => {
  it('recusa quando duas medicoes promovidas em sequencia ultrapassam o saldo', async () => {
    const idA = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 86 },
    ])
    const idB = await createMeasurementInNewPeriod(s, '2026-10-01', 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 86 },
    ])

    await sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [idA])
    expect(await saldo(s.contrapisoId)).toBe(0)

    await expect(
      sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [idB]),
    ).rejects.toThrow(/maximo permitido e 0/)

    // a tentativa recusada nao pode ter deixado nada consumido
    expect(await saldo(s.contrapisoId)).toBe(0)
  })

  it('aceita a promocao quando ainda ha saldo suficiente', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 40 },
    ])
    await sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(46)
  })

  it('reativar uma medicao cancelada tambem revalida o saldo', async () => {
    // enquanto CANCELADA, o item pode carregar uma quantidade que nao
    // caberia no saldo -- o bloqueio so precisa valer quando ela volta a
    // disputar saldo de verdade.
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    await sql(
      `update measurement_items set qty_requested = 200
       where measurement_id = $1 and contract_item_id = $2`,
      [id, s.contrapisoId],
    )

    await expect(
      sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [id]),
    ).rejects.toThrow(/maximo permitido e 86/)
  })
})

/* Item I2 da rodada de correcao 1: NF_ENVIADA e NF_APROVADA estavam na
   regra mas sem nenhum teste cobrindo-os -- exatamente a janela "ja
   faturado, ainda nao pago" onde remedir e mais caro. */
describe.each(['EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'] as const)(
  'status %s consome saldo',
  (status) => {
    it('reduz o saldo pela quantidade solicitada', async () => {
      await createMeasurement(s, status, [
        { contractItemId: s.contrapisoId, requested: 30 },
      ])
      expect(await saldo(s.contrapisoId)).toBe(56)
    })
  },
)

/* Item I3 da rodada de correcao 1: o trigger so disparava em
   `update of qty_requested, qty_approved`, entao trocar contract_item_id
   (ou measurement_id) driblava a checagem. */
describe('revalidacao ao trocar o item medido', () => {
  it('trocar contract_item_id revalida o saldo do item de destino', async () => {
    // consome quase todo o saldo do Contrapiso por outra medicao
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 80, approved: 80 },
    ])
    // uma medicao de Alvenaria, dentro do saldo dela (200 m2), em outro
    // periodo (measurements_one_active nao permite duas medicoes vivas
    // no mesmo par periodo/contrato)
    const id = await createMeasurementInNewPeriod(s, '2026-10-01', 'EM_ANALISE', [
      { contractItemId: s.alvenariaId, requested: 50 },
    ])

    // trocar o item medido para Contrapiso: sobram so 6 m2 de saldo, e a
    // linha pede 50 -- tem que ser recusado, nao silenciosamente aceito
    await expect(
      sql(
        `update measurement_items set contract_item_id = $1
         where measurement_id = $2 and contract_item_id = $3`,
        [s.contrapisoId, id, s.alvenariaId],
      ),
    ).rejects.toThrow(/maximo permitido e 6/)
  })
})

/* Integridade: nada validava que o contract_item pertence ao contrato da
   medicao que o esta consumindo. */
describe('integridade contrato/item', () => {
  it('recusa item de contrato diferente do contrato da medicao', async () => {
    const [contractor2] = await sql<{ id: string }>(
      `insert into contractors (company_id, name) values ($1, 'Empreiteira Beta')
       returning id`,
      [s.companyId],
    )
    const [contract2] = await sql<{ id: string }>(
      `insert into contracts (company_id, project_id, contractor_id, number)
       values ($1, $2, $3, '099/2026') returning id`,
      [s.companyId, s.projectId, contractor2.id],
    )
    const [item2] = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, unit_id, service_name, unit, quantity, unit_price)
       values ($1, $2, $3, 'Pintura', 'm2', 40, 30) returning id`,
      [s.companyId, contract2.id, s.unitId],
    )

    const id = await createMeasurement(s, 'RASCUNHO', [])

    await expect(
      sql(
        `insert into measurement_items (company_id, measurement_id, contract_item_id, qty_requested)
         values ($1, $2, $3, 10)`,
        [s.companyId, id, item2.id],
      ),
    ).rejects.toThrow(/nao pertence ao contrato/)
  })
})
