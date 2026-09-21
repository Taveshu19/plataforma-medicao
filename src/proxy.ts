import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROTAS_PUBLICAS = ['/entrar', '/auth']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser revalida o token no servidor. Nao troque por getSession,
  // que confia no cookie sem verificar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const caminho = request.nextUrl.pathname
  const ehPublica = ROTAS_PUBLICAS.some((r) => caminho.startsWith(r))

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    return NextResponse.redirect(url)
  }

  if (user && caminho === '/entrar') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // tudo, menos estaticos e imagens — senao o redirect bloqueia CSS e JS
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
