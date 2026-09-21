import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto } from '@/app/contexto'
import { obterVisaoContrato } from '@/lib/contrato/dados'
import { Dinheiro } from '@/components/Dinheiro'
import { ListaItensContrato } from './ListaItensContrato'

export default async function ContratoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const visao = await obterVisaoContrato(contexto.contratoId)

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-20 pt-8">
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
          Meu Contrato
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {contexto.obra} • Contrato {contexto.contratoNumero}
          {contexto.descricao ? ` (${contexto.descricao})` : ''}
        </p>
      </header>

      {/* Resumo financeiro do contrato */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Extrato Geral do Contrato
        </p>
        <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          <Dinheiro rotulo="Valor contratado" valor={contexto.resumo.contratado} />
          <Dinheiro rotulo="Já aprovado" valor={contexto.resumo.aprovado} cor="positivo" />
          <Dinheiro rotulo="Em aprovação" valor={contexto.resumo.emAprovacao} cor="atencao" />
          <Dinheiro rotulo="Saldo a medir" valor={contexto.resumo.disponivel} destaque />
        </div>
      </section>

      {/* Lista detalhada de itens */}
      {visao && visao.etapas.length > 0 ? (
        <ListaItensContrato etapas={visao.etapas} />
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            Nenhum item de serviço cadastrado para este contrato.
          </p>
        </div>
      )}
    </main>
  )
}
