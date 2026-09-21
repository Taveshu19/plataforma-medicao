import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { sql } from './db'

config({ path: '.env.test' })

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!
const SERVICE = process.env.SERVICE_ROLE_KEY!

export const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface TestUser {
  userId: string
  client: SupabaseClient
}

/** Cria um usuario de teste, seu profile e um vinculo na empresa. */
export async function createUser(
  email: string,
  companyId: string,
  role: string,
): Promise<TestUser> {
  const password = 'teste-123456'

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  const userId = data.user.id

  await sql('insert into profiles (id, full_name) values ($1, $2)', [userId, email])
  await sql(
    'insert into memberships (user_id, company_id, role) values ($1, $2, $3)',
    [userId, companyId, role],
  )

  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error

  return { userId, client }
}

export async function createCompany(name: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    'insert into companies (name) values ($1) returning id',
    [name],
  )
  return rows[0].id
}

/** Remove todos os usuarios de teste e dados de negocio. */
export async function cleanup(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers()
  for (const user of data?.users ?? []) {
    await admin.auth.admin.deleteUser(user.id)
  }
  await sql('truncate companies cascade')
}
