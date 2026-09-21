import type { NextConfig } from "next";

/**
 * Domínios de túnel usados para demonstração remota (Cloudflare, localhost.run,
 * localtunnel). Só o hostname é comparado: sem esquema e sem porta.
 * Um `*` vale por exatamente um rótulo, então `*.trycloudflare.com` casa com
 * `abc-def.trycloudflare.com`.
 */
const TUNEIS_DE_DEMONSTRACAO = [
  '*.trycloudflare.com',
  '*.lhr.life',
  '*.loca.lt',
];

const nextConfig: NextConfig = {
  /**
   * Sem isto, o Next bloqueia os arquivos de desenvolvimento pedidos por uma
   * origem diferente daquela em que o servidor subiu. Pelo túnel, o HTML chega
   * renderizado no servidor mas os scripts do cliente não: a tela aparece
   * completa e morta — digitar não recalcula e os botões não respondem.
   */
  allowedDevOrigins: TUNEIS_DE_DEMONSTRACAO,

  experimental: {
    serverActions: {
      allowedOrigins: [
        ...TUNEIS_DE_DEMONSTRACAO,
        'localhost:3000',
        '127.0.0.1:3000',
      ],
    },
  },
};

export default nextConfig;
