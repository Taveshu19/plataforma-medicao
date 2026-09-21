import Link from 'next/link'
import { redirect } from 'next/navigation'
import { obterEspelhoMedicao } from '@/lib/espelho/dados'
import { formatarReais, competenciaPorExtenso } from '@/app/formato'
import { BotaoImprimir } from './BotaoImprimir'

interface PageProps {
  params: Promise<{
    measurementId: string
  }>
}

function rotuloStatus(status: string) {
  switch (status) {
    case 'RASCUNHO':
      return 'Rascunho'
    case 'EM_ANALISE':
      return 'Em Análise'
    case 'DEVOLVIDA':
      return 'Devolvida'
    case 'APROVADA':
      return 'Aprovada'
    case 'NF_ENVIADA':
      return 'NF Enviada'
    case 'NF_APROVADA':
      return 'NF Aprovada'
    case 'PAGA':
      return 'Paga / Liquidada'
    case 'CANCELADA':
      return 'Cancelada'
    default:
      return status
  }
}

export default async function EspelhoMedicaoPage({ params }: PageProps) {
  const { measurementId } = await params

  const espelho = await obterEspelhoMedicao(measurementId)
  if (!espelho) {
    redirect('/medicoes')
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 print:bg-white print:py-0">
      <main className="mx-auto max-w-4xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:max-w-none print:shadow-none print:ring-0 print:p-0">
        {/* Barra superior de ações (oculta na impressão) */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
          <Link
            href="/medicoes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar para medições
          </Link>

          <BotaoImprimir />
        </div>

        {/* Cabeçalho do Documento Oficial */}
        <header className="border-b-2 border-slate-900 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {espelho.company_name}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                ESPELHO OFICIAL DE MEDIÇÃO
              </h1>
              <p className="mt-1 text-sm text-slate-600 font-medium">
                {espelho.project_name}
              </p>
            </div>

            <div className="text-right">
              <span className="font-mono text-xl font-bold tracking-tight text-slate-900">
                {espelho.protocol}
              </span>
              <div className="mt-1">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                  {rotuloStatus(espelho.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Competência: {competenciaPorExtenso(espelho.competence)}
              </p>
            </div>
          </div>

          {/* Dados cadastrais */}
          <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-xs print:bg-slate-100">
            <div>
              <p className="text-slate-500">Empreiteiro / Fornecedor</p>
              <p className="font-bold text-slate-900">{espelho.contractor_name}</p>
              {espelho.contractor_document && (
                <p className="text-slate-600 font-mono">CNPJ/CPF: {espelho.contractor_document}</p>
              )}
            </div>

            <div>
              <p className="text-slate-500">Contrato Vinculado</p>
              <p className="font-bold text-slate-900">
                Contrato {espelho.contract_number}
                {espelho.contract_description ? ` — ${espelho.contract_description}` : ''}
              </p>
              {espelho.submitted_at && (
                <p className="text-slate-600">
                  Enviado em: {new Date(espelho.submitted_at).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Resumo financeiro consolidado */}
        <section className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Valor Total Solicitado</p>
            <p className="mt-1 text-lg font-bold text-slate-800">
              {formatarReais(espelho.total_requested)}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs text-emerald-800 font-medium">Valor Total Aprovado</p>
            <p className="mt-1 text-lg font-black text-emerald-900">
              {formatarReais(espelho.total_approved)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Nota Fiscal</p>
            {espelho.invoice_number ? (
              <div className="mt-1">
                <p className="text-sm font-bold text-slate-900">
                  NF nº {espelho.invoice_number}
                </p>
                <p className="text-xs text-slate-600">
                  {formatarReais(espelho.invoice_amount ?? 0)} •{' '}
                  <span className="capitalize">{espelho.invoice_status?.toLowerCase()}</span>
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-400 italic">Pendente de emissão</p>
            )}
          </div>
        </section>

        {/* Tabela detalhada de serviços */}
        <section className="my-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
            Detalhamento dos Itens Medidos
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-700">
                  <th className="py-2.5 pl-2">Local / Etapa</th>
                  <th className="py-2.5">Serviço</th>
                  <th className="py-2.5 text-center">Un.</th>
                  <th className="py-2.5 text-right">Preço Unit.</th>
                  <th className="py-2.5 text-right">Qtd. Solicitada</th>
                  <th className="py-2.5 text-right">Qtd. Aprovada</th>
                  <th className="py-2.5 text-right">Subtotal Solicitado</th>
                  <th className="py-2.5 pr-2 text-right">Subtotal Aprovado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {espelho.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="py-2 pl-2 font-medium text-slate-900">
                      {item.unit_name}
                      <span className="block text-[10px] text-slate-400">{item.stage_name}</span>
                    </td>
                    <td className="py-2">
                      <p className="font-semibold text-slate-800">{item.service_name}</p>
                      {item.notes && (
                        <p className="text-[10px] text-slate-500 italic">&ldquo;{item.notes}&rdquo;</p>
                      )}
                    </td>
                    <td className="py-2 text-center text-slate-600 font-mono">{item.unit}</td>
                    <td className="py-2 text-right font-mono text-slate-700">
                      {formatarReais(item.unit_price)}
                    </td>
                    <td className="py-2 text-right font-mono text-slate-700">
                      {item.qty_requested}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-emerald-800">
                      {item.qty_approved}
                    </td>
                    <td className="py-2 text-right font-mono text-slate-700">
                      {formatarReais(item.subtotal_requested)}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-slate-900">
                      {formatarReais(item.subtotal_approved)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={6} className="py-3 pl-2 text-right uppercase tracking-wider text-xs">
                    Totais da Medição:
                  </td>
                  <td className="py-3 text-right font-mono text-xs">
                    {formatarReais(espelho.total_requested)}
                  </td>
                  <td className="py-3 pr-2 text-right font-mono text-sm font-black text-emerald-900">
                    {formatarReais(espelho.total_approved)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Bloco de Assinaturas e Homologação */}
        <section className="mt-12 border-t border-slate-300 pt-8">
          <p className="text-center text-xs text-slate-500 mb-10">
            Declaramos para os devidos fins que os serviços acima relacionados foram executados,
            conferidos e aprovados em conformidade com o projeto e as especificações técnicas vigentes.
          </p>

          <div className="grid grid-cols-3 gap-8 text-center text-xs">
            <div>
              <div className="border-b border-slate-400 pb-1">
                <span className="font-semibold text-slate-800">{espelho.contractor_name}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Empreiteiro Responsável</p>
            </div>

            <div>
              <div className="border-b border-slate-400 pb-1">
                <span className="font-semibold text-slate-800">Engenharia da Obra</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Fiscalização e Medição</p>
            </div>

            <div>
              <div className="border-b border-slate-400 pb-1">
                <span className="font-semibold text-slate-800">Coordenação / Gerência</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Liberação para Faturamento</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
