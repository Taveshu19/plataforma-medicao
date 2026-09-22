import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROTAS_PUBLICAS = ['/entrar', '/auth', '/painel', '/demo']

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
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          // A lib manda headers de no-cache junto da primeira escrita de
          // cookie de sessao (ex.: Cache-Control: private, no-cache,
          // no-store, must-revalidate, max-age=0). Sem isso, um CDN/proxy
          // na frente pode cachear a resposta e servir o token de sessao
          // de um usuario para outro.
          for (const [chave, valor] of Object.entries(headers)) {
            response.headers.set(chave, valor)
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
  const ehPublica = ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(r + '/'))

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const isTunnel = host?.includes('.lhr.life') || host?.includes('.trycloudflare.com') || host?.includes('.loca.lt')
  const proto = isTunnel ? 'https' : (request.headers.get('x-forwarded-proto') ?? (request.url.startsWith('https') ? 'https' : 'http'))

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone()
    if (host) url.host = host
    if (isTunnel) url.port = ''
    url.protocol = `${proto}:`
    url.pathname = '/entrar'
    return NextResponse.redirect(url)
  }

  if (user && caminho === '/entrar') {
    const url = request.nextUrl.clone()
    if (host) url.host = host
    if (isTunnel) url.port = ''
    url.protocol = `${proto}:`
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
