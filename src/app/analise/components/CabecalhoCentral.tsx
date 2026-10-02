import Link from 'next/link'
import { Bell, ChevronDown } from 'lucide-react'
import { Marca } from '@/components/Marca'
import { veFaturamentoComum } from '@/lib/aprovacao/dados'

const PAPEL: Record<string, string> = {
  engenharia: 'Engenharia',
  coordenacao: 'Coordenação',
  gerencia: 'Gerência',
  financeiro: 'Financeiro',
  admin: 'Administração',
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/**
 * Cabeçalho da "Central de Controle" da construtora: marca, avisos, menu do
 * usuário e o seletor Medições | Faturamento Direto (+ Faturamento e NFs para
 * quem é do Administrativo).
 */
export function CabecalhoCentral({
  nome,
  role,
  competencia,
  avisosNaoLidos,
  ativo,
  fdPendentes = 0,
}: {
  nome: string
  role: string
  competencia: string | null
  avisosNaoLidos: number
  ativo: 'medicoes' | 'faturamento-direto'
  fdPendentes?: number
}) {
  const abas = [
    { chave: 'medicoes', href: '/analise', rotulo: 'Medições' },
    {
      chave: 'faturamento-direto',
      href: '/analise/faturamento-direto',
      rotulo: fdPendentes > 0 ? `Faturamento Direto (${fdPendentes})` : 'Faturamento Direto',
    },
    ...(veFaturamentoComum(role) ? [{ chave: 'faturamento', href: '/faturamento', rotulo: 'Faturamento e NFs' }] : []),
  ]

  return (
    <header className="central-header">
      <div className="central-topo">
        <Marca />
        <div className="flex items-center gap-2">
          <Link href="/notificacoes" aria-label="Avisos" className="central-sino">
            <Bell size={24} aria-hidden="true" />
            {avisosNaoLidos > 0 && <span className="central-sino-ponto" aria-label={`${avisosNaoLidos} avisos não lidos`} />}
          </Link>
          <details className="central-usuario">
            <summary aria-label="Menu do usuário">
              <span className="central-avatar">{iniciais(nome)}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="central-menu">
              <p className="px-3 pb-2 pt-1 text-xs text-slate-500">
                {nome}
                <br />
                <span className="font-semibold text-slate-700">{PAPEL[role] ?? role}</span>
              </p>
              <Link href="/analise/prazos">Prazos da medição</Link>
              <Link href="/notificacoes">Avisos</Link>
              <form action="/sair" method="post">
                <button type="submit">Sair</button>
              </form>
            </div>
          </details>
        </div>
      </div>

      <h1 className="central-titulo">Central de Controle</h1>
      <p className="central-subtitulo">
        {PAPEL[role] ?? role}
        {competencia ? ` • ${competencia}` : ''}
      </p>

      <nav className="central-segmento" aria-label="Seções">
        {abas.map((a) => (
          <Link key={a.chave} href={a.href} aria-current={a.chave === ativo ? 'page' : undefined}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
    </header>
  )
}
