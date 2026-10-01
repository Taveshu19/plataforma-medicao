import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto, competenciaPorExtenso, formatarReais } from '@/app/contexto'
import { obterDadosMedicaoParaNF } from '@/lib/faturamento/dados'
import { FormularioEnvioNF } from './FormularioEnvioNF'

interface PaginaEnvioNFProps {
  params: Promise<{ measurementId: string }>
}

export default async function PaginaEnvioNF({ params }: PaginaEnvioNFProps) {
  const { measurementId } = await params
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const dados = await obterDadosMedicaoParaNF(measurementId)
  if (!dados) redirect('/medicoes')

  // Se já foi enviada ou paga
  if (dados.status !== 'APROVADA') {
    return (
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <header className="mb-6">
          <Link
            href="/medicoes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar para Minhas Medições
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Nota Fiscal
          </h1>
        </header>

        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            Status: {dados.status}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Esta medição não está aguardando nota fiscal no momento.
          </p>
          {dados.lastInvoice && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-700 space-y-1 ring-1 ring-slate-200">
              <p><strong className="font-semibold">NF nº:</strong> {dados.lastInvoice.number}</p>
              <p><strong className="font-semibold">Valor:</strong> {formatarReais(dados.lastInvoice.amount)}</p>
              <p><strong className="font-semibold">Status:</strong> {dados.lastInvoice.status}</p>
            </div>
          )}
          <Link
            href="/medicoes"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Voltar
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link
          href="/medicoes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Minhas Medições
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Enviar Nota Fiscal
        </h1>
        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
          Medição aprovada – faturamento liberado
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {dados.projectName} • {competenciaPorExtenso(dados.competence)}
        </p>
      </header>

      {/* Card com resumo financeiro aprovado */}
      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Valor Aprovado para Faturamento
        </p>
        <p className="mt-1 text-2xl font-extrabold text-slate-900">
          {formatarReais(dados.approvedAmount)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>Protocolo: <strong className="font-mono text-slate-700">{dados.protocol}</strong></span>
          {dados.invoiceTolerance > 0 && (
            <span>Tolerância: ± {formatarReais(dados.invoiceTolerance)}</span>
          )}
        </div>
      </section>

      {/* Formulário de emissão */}
      <FormularioEnvioNF
        measurementId={dados.id}
        companyId={dados.companyId}
        valorAprovado={dados.approvedAmount}
        tolerancia={dados.invoiceTolerance}
        ultimoNumero={dados.lastInvoice?.number}
        motivoRejeicao={dados.lastInvoice?.rejectionReason}
      />
    </main>
  )
}
