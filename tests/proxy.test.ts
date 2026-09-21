import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * O @supabase/ssr real so chama `setAll` quando decide renovar o token
 * (refresh de sessao). Simular isso via HTTP real seria caro e fragil, entao
 * mockamos `createServerClient` para invocar `setAll(cookiesToSet, headers)`
 * exatamente como a lib faz em `applyServerStorage` (ver
 * node_modules/@supabase/ssr/dist/module/cookies.js), incluindo os headers
 * de no-cache que a lib manda junto da primeira escrita de cookie de sessao.
 * O que este teste prova: que `src/proxy.ts` aplica esse segundo parametro
 * na resposta, em vez de descarta-lo (bug corrigido na rodada de revisao).
 */
const HEADERS_NO_CACHE = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

const getUserMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: any) => {
    // Simula uma renovacao de token: a lib grava um cookie novo e entrega
    // os headers de no-cache junto, como documentado em
    // node_modules/@supabase/ssr/dist/module/types.d.ts (SetAllCookies).
    options.cookies.setAll(
      [{ name: 'sb-access-token', value: 'novo-token', options: { path: '/' } }],
      HEADERS_NO_CACHE,
    )
    return { auth: { getUser: getUserMock } }
  }),
}))

describe('proxy — headers de no-cache no refresh de sessao', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-fake')
    getUserMock.mockReset()
  })

  it('aplica Cache-Control, Expires e Pragma na resposta quando setAll recebe headers', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const { proxy } = await import('../src/proxy')
    const request = new NextRequest('http://localhost/obras')

    const response = await proxy(request)

    expect(response.headers.get('Cache-Control')).toBe(HEADERS_NO_CACHE['Cache-Control'])
    expect(response.headers.get('Expires')).toBe(HEADERS_NO_CACHE.Expires)
    expect(response.headers.get('Pragma')).toBe(HEADERS_NO_CACHE.Pragma)
  })

  it('rota publica por prefixo exato: /entrar libera, /entraralgo nao', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const { proxy } = await import('../src/proxy')

    const respostaEntrar = await proxy(new NextRequest('http://localhost/entrar'))
    expect(respostaEntrar.status).not.toBe(307)

    const respostaEntrarAlgo = await proxy(new NextRequest('http://localhost/entraralgo'))
    expect(respostaEntrarAlgo.status).toBe(307)
    expect(respostaEntrarAlgo.headers.get('location')).toContain('/entrar')
  })
})
