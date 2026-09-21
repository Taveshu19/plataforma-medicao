import { describe, it, expect } from 'vitest'
import nextConfig from '../next.config'

/**
 * O Next 16 bloqueia por padrao requisicoes cross-origin aos arquivos de
 * desenvolvimento. Sem `allowedDevOrigins`, um acesso vindo de tunel publico
 * (Cloudflare, localhost.run) recebe o HTML renderizado no servidor mas NAO
 * recebe os scripts do cliente. A tela aparece completa e morta: digitar nao
 * recalcula o subtotal e o alternador metragem/% nao responde.
 *
 * Foi exatamente esse o defeito relatado no primeiro teste com o cliente.
 * Estes testes existem para que a configuracao nao volte a se perder.
 */

const dominiosDeTunel = ['*.trycloudflare.com', '*.lhr.life', '*.loca.lt']

describe('configuracao de acesso remoto do Next', () => {
  it('declara allowedDevOrigins no nivel raiz da configuracao', () => {
    expect(nextConfig.allowedDevOrigins).toBeDefined()
    expect(Array.isArray(nextConfig.allowedDevOrigins)).toBe(true)
  })

  it('libera os dominios de tunel usados para demonstracao', () => {
    for (const dominio of dominiosDeTunel) {
      expect(nextConfig.allowedDevOrigins).toContain(dominio)
    }
  })

  it('nao declara porta nem esquema nas entradas', () => {
    // A doc do Next 16 e explicita: so o hostname do Origin e comparado.
    // Entradas com https:// ou :3000 nunca casam e falham em silencio.
    for (const entrada of nextConfig.allowedDevOrigins ?? []) {
      expect(entrada).not.toMatch(/^https?:\/\//)
      expect(entrada).not.toMatch(/:\d+$/)
    }
  })

  it('mantem as Server Actions liberadas para os mesmos tuneis', () => {
    const origens = nextConfig.experimental?.serverActions?.allowedOrigins ?? []
    for (const dominio of dominiosDeTunel) {
      expect(origens).toContain(dominio)
    }
  })
})
