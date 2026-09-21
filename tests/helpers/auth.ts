import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { sql } from './db'

config({ path: '.env.test' })

const SUPABASE_URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!
const SERVICE = process.env.SERVICE_ROLE_KEY!

export const admin = createClient(SUPABASE_URL, SERVICE, {
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

  const client = createClient(SUPABASE_URL, ANON, {
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

function isLocalUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value)
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

/**
 * Trava defensiva: cleanup() apaga TODOS os usuarios do Auth e da um
 * `truncate companies cascade`. So pode rodar contra a stack local.
 */
function assertLocalStack(): void {
  const dbUrl = process.env.DB_URL ?? ''
  const apiUrl = SUPABASE_URL

  if (!isLocalUrl(dbUrl) || !isLocalUrl(apiUrl)) {
    throw new Error(
      'cleanup() so pode rodar contra a stack local (DB_URL/API_URL apontando para ' +
        '127.0.0.1 ou localhost). Abortando para evitar apagar dados de um ambiente real.',
    )
  }
}

/** Remove todos os usuarios de teste e dados de negocio. */
export async function cleanup(): Promise<void> {
  assertLocalStack()

  const { data } = await admin.auth.admin.listUsers()
  for (const user of data?.users ?? []) {
    await admin.auth.admin.deleteUser(user.id)
  }
  await sql('truncate companies cascade')
}

/** Cria usuario cujo acesso e limitado a uma unica obra. */
export async function createScopedUser(
  email: string,
  companyId: string,
  projectId: string,
  role: string,
): Promise<TestUser> {
  const user = await createUser(email, companyId, role)
  await sql('update memberships set project_id = $1 where user_id = $2', [
    projectId,
    user.userId,
  ])
  return user
}
