import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.test' })

const DB_URL =
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function resetAlfaCurrentMeasurement() {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  try {
    await client.query(`
      delete from measurements
      where contract_id in (
        select id from contracts where number = '023/2026'
      )
      and period_id in (
        select id from measurement_periods where competence = date_trunc('month', now())::date
      )
    `)
  } finally {
    await client.end()
  }
}
