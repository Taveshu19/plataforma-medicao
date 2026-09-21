import { sql } from './db'
import { createCompany } from './auth'

export interface Scenario {
  companyId: string
  projectId: string
  contractorId: string
  contractId: string
  periodId: string
  /** Contrapiso: 86 m2 a R$ 112,00 */
  contrapisoId: string
  /** Alvenaria: 200 m2 a R$ 90,00 */
  alvenariaId: string
  unitId: string
}

/** Uma construtora, uma obra, um empreiteiro, um contrato, dois servicos. */
export async function buildScenario(): Promise<Scenario> {
  const companyId = await createCompany('Construtora Vista')

  const [project] = await sql<{ id: string }>(
    `insert into projects (company_id, name, unit_label, approval_levels)
     values ($1, 'Residencial Vista Alta', 'casa', 3) returning id`,
    [companyId],
  )
  const [stage] = await sql<{ id: string }>(
    `insert into stages (company_id, project_id, name) values ($1, $2, 'Casas 01 a 20')
     returning id`,
    [companyId, project.id],
  )
  const [unit] = await sql<{ id: string }>(
    `insert into units (company_id, stage_id, name) values ($1, $2, 'Casa 07')
     returning id`,
    [companyId, stage.id],
  )
  const [contractor] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreiteira Alfa')
     returning id`,
    [companyId],
  )
  const [contract] = await sql<{ id: string }>(
    `insert into contracts (company_id, project_id, contractor_id, number)
     values ($1, $2, $3, '023/2026') returning id`,
    [companyId, project.id, contractor.id],
  )
  const items = await sql<{ id: string; service_name: string }>(
    `insert into contract_items
       (company_id, contract_id, unit_id, service_name, unit, quantity, unit_price)
     values ($1, $2, $3, 'Contrapiso', 'm2', 86, 112),
            ($1, $2, $3, 'Alvenaria', 'm2', 200, 90)
     returning id, service_name`,
    [companyId, contract.id, unit.id],
  )
  const [period] = await sql<{ id: string }>(
    `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
     values ($1, $2, '2026-09-01', now() - interval '1 day', now() + interval '9 days')
     returning id`,
    [companyId, project.id],
  )

  return {
    companyId,
    projectId: project.id,
    contractorId: contractor.id,
    contractId: contract.id,
    periodId: period.id,
    unitId: unit.id,
    contrapisoId: items.find((i) => i.service_name === 'Contrapiso')!.id,
    alvenariaId: items.find((i) => i.service_name === 'Alvenaria')!.id,
  }
}

/** Cria uma medicao no status informado, com os itens dados. */
export async function createMeasurement(
  s: Scenario,
  status: string,
  items: Array<{ contractItemId: string; requested: number; approved?: number }>,
): Promise<string> {
  const [m] = await sql<{ id: string }>(
    `insert into measurements (company_id, period_id, contract_id, status)
     values ($1, $2, $3, 'RASCUNHO') returning id`,
    [s.companyId, s.periodId, s.contractId],
  )
  for (const item of items) {
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
       values ($1, $2, $3, $4, $5)`,
      [s.companyId, m.id, item.contractItemId, item.requested, item.approved ?? null],
    )
  }
  if (status !== 'RASCUNHO') {
    await sql(
      `update measurements set status = $2::measurement_status where id = $1`,
      [m.id, status],
    )
  }
  return m.id
}
