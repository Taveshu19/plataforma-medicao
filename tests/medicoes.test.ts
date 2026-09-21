import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('medicoes', () => {
  it('nasce em rascunho, sem protocolo e no nivel zero', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    const [m] = await sql<{ status: string; protocol: string | null; current_level: number }>(
      'select status, protocol, current_level from measurements where id = $1',
      [id],
    )
    expect(m.status).toBe('RASCUNHO')
    expect(m.protocol).toBeNull()
    expect(m.current_level).toBe(0)
  })

  it('impede duas medicoes vivas para o mesmo contrato no mesmo periodo', async () => {
    await createMeasurement(s, 'RASCUNHO', [])
    await expect(createMeasurement(s, 'RASCUNHO', [])).rejects.toThrow()
  })

  it('libera o periodo quando a medicao anterior foi cancelada', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    const nova = await createMeasurement(s, 'RASCUNHO', [])
    expect(nova).toBeTruthy()
  })

  it('impede o mesmo item de contrato duas vezes na mesma medicao', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 10 },
    ])
    await expect(
      sql(
        `insert into measurement_items
           (company_id, measurement_id, contract_item_id, qty_requested)
         values ($1, $2, $3, 5)`,
        [s.companyId, id, s.contrapisoId],
      ),
    ).rejects.toThrow()
  })

  it('gera protocolo no formato MED-AAAA-MM-NNN', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    const [row] = await sql<{ protocol: string }>('select next_protocol($1) as protocol', [id])
    expect(row.protocol).toBe('MED-2026-09-001')
  })
})
