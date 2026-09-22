import Link from 'next/link'
import { Marca } from '@/components/Marca'
import { ActionLink } from '@/components/ui'
import { Ruler, History, FileText } from 'lucide-react'
import { redirect } from 'next/navigation'
import { carregarContexto } from './contexto'
import { competenciaPorExtenso } from './formato'
import { Dinheiro } from '@/components/Dinheiro'
import { TrilhaStatus } from '@/components/TrilhaStatus'
import { contarNaoLidos } from '@/lib/notificacoes/dados'
import { obterPerfilUsuario } from '@/lib/aprovacao/dados'

export default async function Home() {
  const perfil = await obterPerfilUsuario()
  if (perfil?.isConstrutora) {
    redirect('/analise')
  }

  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const { nome, obra, contratoNumero, descricao, resumo, periodo, trilha, protocoloAtual } =
    contexto
  const avisosNaoLidos = await contarNaoLidos()

  return (
    <>
    <div className="product-bar"><div className="product-bar-inner"><Marca /><span className="product-bar-caption">Portal do empreiteiro</span></div></div>
    <main className="home-workspace mx-auto w-full px-5 pb-16 pt-8">
      <header className="home-greeting flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">Olá,</p>
          <h1 className="text-2xl font-bold tracking-tight">{nome}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/notificacoes"
            aria-label="Avisos"
            className="relative rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300"
          >
            Avisos
            {avisosNaoLidos > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                {avisosNaoLidos > 9 ? '9+' : avisosNaoLidos}
              </span>
            )}
          </Link>

        <form action="/sair" method="post">
          <button type="submit" className="text-sm text-slate-500 underline underline-offset-4">
            Sair
          </button>
        </form>
        </div>
      </header>

      <div className="home-grid"><div>
      <section className="contract-hero">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Obra</p>
        <p className="mt-1 text-lg font-semibold">{obra}</p>
        <p className="mt-3 text-sm text-slate-600">
          Contrato {contratoNumero}
          {descricao ? ` — ${descricao}` : ''}
        </p>

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <Dinheiro rotulo="Valor contratado" valor={resumo.contratado} />
          <Dinheiro rotulo="Já aprovado" valor={resumo.aprovado} cor="positivo" />
          <Dinheiro rotulo="Em aprovação" valor={resumo.emAprovacao} cor="atencao" />
          <Dinheiro rotulo="Saldo a medir" valor={resumo.disponivel} destaque />
        </div>
      </section>



      </div><div className="home-side">
      <p className="section-eyebrow mt-6 md:mt-0">Próximo passo</p>
      {periodo ? (
        <section className="mt-5 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-900">
            Medição de {competenciaPorExtenso(periodo.competencia)} aberta
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Você pode enviar até{' '}
            {new Date(periodo.fechaEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            .
          </p>
        </section>
      ) : (
        <section className="mt-5 rounded-2xl bg-slate-100 p-5 ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-700">
            Não há período de medição aberto no momento.
          </p>
        </section>
      )}

      <nav className="mt-8 space-y-3" aria-label="Ações da obra">
        {periodo ? <ActionLink href="/medicao" icon={Ruler} primary>Fazer minha medição</ActionLink> : <button disabled className="ui-button ui-button-primary w-full">Fazer minha medição</button>}
        <ActionLink href="/medicoes" icon={History}>Medições anteriores</ActionLink>
        <ActionLink href="/contrato" icon={FileText}>Meu contrato</ActionLink>
      </nav>
      <TrilhaStatus passos={trilha} protocolo={protocoloAtual} />
      </div></div>
    </main></>
  )
}
