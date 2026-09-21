import { createServerSupabase } from '@/lib/supabase/server'

export interface Aviso {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

/**
 * Avisos do usuário logado. A RLS já restringe às próprias notificações —
 * não há filtro por usuário aqui de propósito.
 */
export async function listarAvisos(limite = 50): Promise<Aviso[]> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error || !data) return []

  return data.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    body: (r.body as string | null) ?? null,
    link: (r.link as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: String(r.created_at),
  }))
}

export async function contarNaoLidos(): Promise<number> {
  const supabase = await createServerSupabase()

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) return 0
  return count ?? 0
}
