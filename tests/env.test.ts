import { describe, it, expect } from 'vitest'
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'

config({ path: '.env.local' })

describe('configuracao da aplicacao', () => {
  it('tem a URL publica do Supabase apontando para a stack local', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(url).toBeTruthy()
    expect(new URL(url!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/)
  })

  it('tem a chave publica do Supabase', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeTruthy()
  })

  it('nao expoe a chave de service role para o navegador', () => {
    const publicas = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'))
    for (const chave of publicas) {
      expect(process.env[chave]).not.toContain('service_role')
    }
  })

  it('o .env.example esta commitado e nao contem segredo', () => {
    const exemplo = readFileSync('.env.example', 'utf8')
    expect(exemplo).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(exemplo).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(exemplo).not.toMatch(/eyJ|sb_secret|service_role/)
  })
})
