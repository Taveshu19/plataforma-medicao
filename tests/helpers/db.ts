import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.test' })

export const DB_URL =
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const pool = new Pool({ connectionString: DB_URL })

export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(query, params)
  return result.rows as T[]
}

export async function closePool(): Promise<void> {
  await pool.end()
}
