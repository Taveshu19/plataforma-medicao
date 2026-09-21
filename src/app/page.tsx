import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto } from './contexto'
import { competenciaPorExtenso } from './formato'
import { Dinheiro } from '@/components/Dinheiro'
import { TrilhaStatus } from '@/components/TrilhaStatus'
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

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">Olá,</p>
          <h1 className="text-2xl font-bold tracking-tight">{nome}</h1>
        </div>
        <form action="/sair" method="post">
          <button type="submit" className="text-sm text-slate-500 underline underline-offset-4">
            Sair
          </button>
        </form>
      </header>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
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

      <TrilhaStatus passos={trilha} protocolo={protocoloAtual} />

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

      <nav className="mt-8 space-y-3">
        {periodo ? (
          <Link
            href="/medicao"
            className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-5 text-base font-semibold text-white hover:bg-slate-800"
          >
            Fazer minha medição
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-slate-900 px-4 py-5 text-base font-semibold text-white disabled:opacity-40"
          >
            Fazer minha medição
          </button>
        )}
        <Link
          href="/medicoes"
          className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-5 text-base font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Medições anteriores
        </Link>
        <Link
          href="/contrato"
          className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-5 text-base font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Meu contrato
        </Link>
      </nav>
    </main>
  )
}
