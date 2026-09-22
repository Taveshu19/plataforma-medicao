import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

/**
 * Cliente para componentes e acoes de servidor.
 * E assincrona porque `cookies()` e assincrono no Next 16.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, _headers) {
          // _headers traz os headers de no-cache que devem acompanhar uma
          // resposta que grava cookie de sessao (CDN nao pode cachear isso).
          // Um componente/acao de servidor nao tem acesso ao objeto de
          // resposta HTTP para aplicar headers, entao nao ha onde escrever
          // isso aqui — e descartado de proposito, nao por esquecimento.
          // Quem aplica esses headers e o proxy (src/proxy.ts), que roda
          // antes e tem a resposta em maos.
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
