import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente para componentes e acoes de servidor.
 * E assincrona porque `cookies()` e assincrono no Next 16.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Componente de servidor nao pode gravar cookie.
            // O proxy ja renovou a sessao nesta requisicao, entao ignorar e seguro.
          }
        },
      },
    },
  )
}
