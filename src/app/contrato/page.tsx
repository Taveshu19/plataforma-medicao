import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto } from '@/app/contexto'
import { obterVisaoContrato, obterResumoPorServico } from '@/lib/contrato/dados'
import { Dinheiro } from '@/components/Dinheiro'
import { ResumoPorServico } from './ResumoPorServico'
import { DetalhePorLocal } from './DetalhePorLocal'

export default async function ContratoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const [visao, servicos] = await Promise.all([
    obterVisaoContrato(contexto.contratoId),
    obterResumoPorServico(contexto.contratoId),
  ])

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

      {/* Documento do contrato, para consulta ou impressão */}
      <Link
        href="/contrato/folha"
        data-testid="link-folha-contrato"
        className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-sm transition hover:bg-slate-800"
      >
        <span>
          <span className="block text-sm font-semibold">Ver contrato completo</span>
          <span className="mt-0.5 block text-xs text-slate-300">
            Folha para consulta, impressão ou PDF
          </span>
        </span>
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </Link>

      {/* Resumo financeiro do contrato */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
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

      {/* Totais por serviço, somando todos os locais */}
      <ResumoPorServico servicos={servicos} />

      {/* Detalhe local a local, recolhido para a página não ficar longa demais */}
      {visao && visao.etapas.length > 0 ? (
        <DetalhePorLocal etapas={visao.etapas} rotuloLocal={contexto.rotuloLocal} />
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
