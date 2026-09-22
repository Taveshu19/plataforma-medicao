import { Marca } from '@/components/Marca'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto } from '@/app/contexto'
import { obterVisaoContrato, obterResumoPorServico } from '@/lib/contrato/dados'
import { formatarReais } from '@/app/formato'
import { BotaoImprimir } from './BotaoImprimir'

/**
 * Folha do contrato para consulta, impressão ou salvamento em PDF.
 *
 * Não é o contrato assinado — é a relação oficial de serviços, quantidades e
 * preços gerada pelo sistema. Anexar o documento assinado da construtora é o
 * passo seguinte, quando houver obra real com arquivo para subir.
 */
export default async function FolhaContratoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const [visao, servicos] = await Promise.all([
    obterVisaoContrato(contexto.contratoId),
    obterResumoPorServico(contexto.contratoId),
  ])

  const emitidoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/contrato"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <BotaoImprimir />
      </div>

      <article className="document-sheet rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <div className="document-masthead"><Marca /><span>DOCUMENTO DA OBRA</span></div>
        <header className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Relação de Serviços do Contrato
          </h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="text-slate-500">Obra:</dt>
              <dd className="font-semibold text-slate-900">{contexto.obra}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Contrato:</dt>
              <dd className="font-semibold text-slate-900">{contexto.contratoNumero}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Empreiteiro:</dt>
              <dd className="font-semibold text-slate-900">{contexto.nome}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Emitido em:</dt>
              <dd className="font-semibold text-slate-900">{emitidoEm}</dd>
            </div>
          </dl>
          {contexto.descricao && (
            <p className="mt-2 text-xs text-slate-600">{contexto.descricao}</p>
          )}
        </header>

        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Resumo por serviço
          </h2>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-500">
                <th className="py-2 font-medium">Serviço</th>
                <th className="py-2 text-right font-medium">Qtd. total</th>
                <th className="py-2 text-right font-medium">Executado</th>
                <th className="py-2 text-right font-medium">Saldo</th>
                <th className="py-2 text-right font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={`${s.serviceName}-${s.unit}`} className="border-b border-slate-100">
                  <td className="py-1.5 font-medium text-slate-900">{s.serviceName}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {s.totalQuantity.toLocaleString('pt-BR')} {s.unit}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {s.measuredQuantity.toLocaleString('pt-BR')} {s.unit}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {s.balanceQuantity.toLocaleString('pt-BR')} {s.unit}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatarReais(s.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900">
                <td colSpan={4} className="py-2 text-right font-bold text-slate-900">
                  Valor total do contrato
                </td>
                <td className="py-2 text-right font-bold tabular-nums text-slate-900">
                  {formatarReais(contexto.resumo.contratado)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {visao && visao.etapas.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Detalhamento por {contexto.rotuloLocal}
            </h2>
            {visao.etapas.map((etapa) => (
              <div key={etapa.stageName} className="mt-4 break-inside-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {etapa.stageName}
                </h3>
                {etapa.locais.map((local) => (
                  <div key={local.unitName} className="mt-2">
                    <p className="text-xs font-semibold text-slate-800">{local.unitName}</p>
                    <table className="mt-1 w-full text-[11px]">
                      <tbody>
                        {local.itens.map((item) => (
                          <tr key={item.itemId} className="border-b border-slate-100">
                            <td className="py-1 text-slate-700">{item.serviceName}</td>
                            <td className="py-1 text-right tabular-nums text-slate-600">
                              {item.quantity.toLocaleString('pt-BR')} {item.unit}
                            </td>
                            <td className="py-1 text-right tabular-nums text-slate-600">
                              {formatarReais(item.unitPrice)}/{item.unit}
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums text-slate-900">
                              {formatarReais(item.totalPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}

        <footer className="mt-12 grid grid-cols-2 gap-8 break-inside-avoid">
          <div className="border-t border-slate-400 pt-2 text-center text-[11px] text-slate-600">
            Empreiteiro
          </div>
          <div className="border-t border-slate-400 pt-2 text-center text-[11px] text-slate-600">
            Construtora
          </div>
        </footer>
      </article>
    </main>
  )
}
