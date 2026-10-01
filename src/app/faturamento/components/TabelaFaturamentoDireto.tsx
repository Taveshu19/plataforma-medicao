'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FaturamentoDiretoResumo } from '@/lib/faturamento-direto/dados'
import { TIPOS_FATURAMENTO } from '@/lib/faturamento-direto/rotulos'
import { formatarReais } from '@/app/formato'
import { pagarFaturamentoDiretoAction } from '@/app/faturamento-direto/acoes'
import { LinksArquivosNF, SeloOrigem, SeloStatusFD, dataHora } from '@/components/FaturamentoDireto'

export function TabelaFaturamentoDireto({ itens }: { itens: FaturamentoDiretoResumo[] }) {
  const [processando, setProcessando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const pagar = async (fd: FaturamentoDiretoResumo) => {
    setProcessando(fd.id)
    setMensagem(null)
    const r = await pagarFaturamentoDiretoAction(fd.id)
    setProcessando(null)
    setMensagem(
      r.success
        ? { tipo: 'sucesso', texto: `Pagamento do ${fd.protocol} (NF ${fd.number}) registrado.` }
        : { tipo: 'erro', texto: r.error ?? 'Erro ao registrar pagamento.' },
    )
  }

  return (
    <div className="space-y-4">
      {mensagem && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold ring-1 ${
            mensagem.tipo === 'sucesso' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Nenhum faturamento direto liberado pela Engenharia.</p>
          <p className="mt-1 text-xs text-slate-500">Quando a Engenharia aprovar uma NF de material, ela aparece aqui.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((fd) => (
            <div
              key={fd.id}
              data-testid={`card-fd-${fd.number}`}
              className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-200"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SeloOrigem origem="DIRETO" />
                    <p className="mt-2 font-mono text-sm font-extrabold text-slate-900">NF nº {fd.number}</p>
                    <p className="text-xs text-slate-500">Protocolo: {fd.protocol}</p>
                  </div>
                  <SeloStatusFD status={fd.status} />
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">{fd.contractorName}</p>
                  <p className="text-slate-500">{fd.projectName} • {TIPOS_FATURAMENTO[fd.billingType] ?? fd.billingType}</p>
                  <p className="mt-2 text-slate-700">{fd.description}</p>
                  {fd.notes && <p className="mt-1 text-[11px] text-slate-500">Obs.: {fd.notes}</p>}
                  <p className="mt-2 text-[11px] text-slate-400">Aprovado pela Engenharia em {dataHora(fd.approvedAt)}</p>
                  {fd.paidAt && <p className="text-[11px] text-slate-400">Pago em {dataHora(fd.paidAt)}</p>}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs ring-1 ring-slate-100">
                  <span className="text-slate-500">Valor da Nota:</span>
                  <span className="font-mono font-bold text-slate-900">{formatarReais(fd.amount)}</span>
                </div>

                <div className="mt-3">
                  <LinksArquivosNF pdfPath={fd.pdfPath} xmlPath={fd.xmlPath} />
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <Link
                  href={`/analise/faturamento-direto/${fd.id}`}
                  className="block text-center text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                >
                  Ver histórico completo
                </Link>
                {fd.status === 'APROVADO' && (
                  <button
                    type="button"
                    onClick={() => pagar(fd)}
                    disabled={processando === fd.id}
                    className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {processando === fd.id ? 'Registrando...' : 'Registrar Pagamento'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
