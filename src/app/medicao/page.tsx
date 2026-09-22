import Link from 'next/link'
import { StepHeader } from '@/components/ui'
import { redirect } from 'next/navigation'
import { carregarContexto, competenciaPorExtenso, formatarReais } from '../contexto'
import { obterOuCriarRascunho, listarLocaisMedicao } from '@/lib/medicao/dados'
import { ListaLocais } from './components/ListaLocais'

export default async function MedicaoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  if (!contexto.periodo) {
    return (
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <div className="rounded-2xl bg-slate-100 p-6 text-center ring-1 ring-slate-200">
          <p className="text-base font-semibold text-slate-800">
            Período fechado
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Não há período aberto para medição nesta obra no momento.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Voltar para o início
          </Link>
        </div>
      </main>
    )
  }

  const rascunho = await obterOuCriarRascunho(contexto.contratoId)
  if (!rascunho) {
    return (
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <div className="rounded-2xl bg-amber-50 p-6 text-center ring-1 ring-amber-200">
          <p className="text-base font-semibold text-amber-900">
            Atenção
          </p>
          <p className="mt-2 text-sm text-amber-800">
            Não foi possível iniciar o rascunho da medição. Verifique se o contrato está ativo ou tente novamente.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Voltar para o início
          </Link>
        </div>
      </main>
    )
  }

  const locais = await listarLocaisMedicao(rascunho.id)
  const totalItensMedidos = locais.reduce((acc, l) => acc + l.measuredItems, 0)
  const totalValorMedido = locais.reduce((acc, l) => acc + l.totalMeasured, 0)

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-24 pt-6">
      <StepHeader current={1} />
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para o início
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Medição do Mês
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {contexto.obra} • {competenciaPorExtenso(contexto.periodo.competencia)}
        </p>
      </header>

      {/* Card de progresso geral */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total medido no rascunho
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {formatarReais(totalValorMedido)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500">Serviços</p>
            <p className="mt-0.5 text-sm font-bold text-slate-700">
              {totalItensMedidos} preenchidos
            </p>
          </div>
        </div>
      </section>

      {/* Lista de etapas e locais */}
      <ListaLocais locais={locais} />

      {/* Barra de ação inferior */}
      <div className="action-dock fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-md">
          {totalItensMedidos > 0 ? (
            <Link
              href="/medicao/revisao"
              className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
            >
              Revisar e Enviar ({totalItensMedidos}{' '}
              {totalItensMedidos === 1 ? 'item' : 'itens'})
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-400"
            >
              Selecione um local para medir
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
