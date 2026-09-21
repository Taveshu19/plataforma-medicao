'use client'

import { useState } from 'react'
import { NotaPendente } from '@/lib/faturamento/dados'
import { formatarReais, competenciaPorExtenso } from '@/app/formato'
import {
  aprovarNotaFiscalAction,
  rejeitarNotaFiscalAction,
  marcarComoPagaAction,
} from '@/app/faturamento/acoes'
import { ModalRejeicaoNF } from './ModalRejeicaoNF'

interface TabelaFaturamentoProps {
  notas: NotaPendente[]
}

export function TabelaFaturamento({ notas }: TabelaFaturamentoProps) {
  const [busca, setBusca] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<'TODAS' | 'CONFERENCIA' | 'PAGAMENTO'>(
    'TODAS',
  )
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(
    null,
  )

  // Estado do modal de recusa
  const [modalRecusaAberto, setModalRecusaAberto] = useState(false)
  const [itemParaRecusa, setItemParaRecusa] = useState<NotaPendente | null>(null)

  const filtradas = notas.filter((n) => {
    // Filtro por aba
    if (abaAtiva === 'CONFERENCIA' && n.measurementStatus !== 'NF_ENVIADA') return false
    if (abaAtiva === 'PAGAMENTO' && n.measurementStatus !== 'NF_APROVADA') return false

    // Busca textual
    const termo = busca.toLowerCase()
    return (
      n.protocol.toLowerCase().includes(termo) ||
      n.contractorName.toLowerCase().includes(termo) ||
      n.invoiceNumber.toLowerCase().includes(termo) ||
      n.projectName.toLowerCase().includes(termo)
    )
  })

  const handleAprovar = async (item: NotaPendente) => {
    setProcessandoId(item.invoiceId)
    setMensagem(null)
    const res = await aprovarNotaFiscalAction(item.invoiceId, item.measurementId)
    setProcessandoId(null)
    if (!res.success) {
      setMensagem({ tipo: 'erro', texto: res.error ?? 'Erro ao aprovar nota fiscal.' })
    } else {
      setMensagem({ tipo: 'sucesso', texto: `Nota Fiscal nº ${item.invoiceNumber} aprovada com sucesso!` })
    }
  }

  const handleConfirmarRecusa = async (motivo: string) => {
    if (!itemParaRecusa) return
    const res = await rejeitarNotaFiscalAction(
      itemParaRecusa.invoiceId,
      itemParaRecusa.measurementId,
      motivo,
    )
    setModalRecusaAberto(false)
    setItemParaRecusa(null)
    if (!res.success) {
      setMensagem({ tipo: 'erro', texto: res.error ?? 'Erro ao recusar nota fiscal.' })
    } else {
      setMensagem({
        tipo: 'sucesso',
        texto: `Nota Fiscal nº ${itemParaRecusa.invoiceNumber} recusada e devolvida ao empreiteiro.`,
      })
    }
  }

  const handlePagar = async (item: NotaPendente) => {
    setProcessandoId(item.invoiceId)
    setMensagem(null)
    const res = await marcarComoPagaAction(item.invoiceId, item.measurementId)
    setProcessandoId(null)
    if (!res.success) {
      setMensagem({ tipo: 'erro', texto: res.error ?? 'Erro ao registrar pagamento.' })
    } else {
      setMensagem({
        tipo: 'sucesso',
        texto: `Pagamento da Nota Fiscal nº ${item.invoiceNumber} registrado com sucesso!`,
      })
    }
  }

  return (
    <div className="space-y-6">
      {mensagem && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold ring-1 ${
            mensagem.tipo === 'sucesso'
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-rose-50 text-rose-800 ring-rose-200'
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      {/* Controles: Abas e Busca */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setAbaAtiva('TODAS')}
            className={`rounded-lg px-3 py-1.5 transition ${
              abaAtiva === 'TODAS' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            Todas ({notas.length})
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('CONFERENCIA')}
            className={`rounded-lg px-3 py-1.5 transition ${
              abaAtiva === 'CONFERENCIA' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            Em conferência ({notas.filter((n) => n.measurementStatus === 'NF_ENVIADA').length})
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('PAGAMENTO')}
            className={`rounded-lg px-3 py-1.5 transition ${
              abaAtiva === 'PAGAMENTO' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            Prontas para pagamento ({notas.filter((n) => n.measurementStatus === 'NF_APROVADA').length})
          </button>
        </div>

        <div className="relative max-w-xs sm:w-64">
          <input
            type="text"
            placeholder="Buscar por NF, protocolo ou empreiteiro..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs text-slate-900 shadow-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <svg
            className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Lista / Cards de Faturamento */}
      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">
            Nenhuma nota fiscal encontrada nesta categoria.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Quando os empreiteiros emitirem notas para medições aprovadas, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((item) => {
            const emConferencia = item.measurementStatus === 'NF_ENVIADA'
            const prontaPagamento = item.measurementStatus === 'NF_APROVADA'
            const divergencia = item.invoiceAmount - item.approvedAmount

            return (
              <div
                key={item.invoiceId}
                data-testid={`card-faturamento-${item.invoiceNumber}`}
                className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-extrabold text-slate-900">
                        NF nº {item.invoiceNumber}
                      </span>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Protocolo: {item.protocol}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        emConferencia
                          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                          : 'bg-teal-50 text-teal-700 ring-teal-200'
                      }`}
                    >
                      {emConferencia ? 'Em conferência' : 'NF Aprovada'}
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">{item.contractorName}</p>
                    <p className="text-slate-500">{item.projectName} • {competenciaPorExtenso(item.competence)}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Emitida em: {new Date(item.invoiceIssuedOn).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Comparativo de Valores */}
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Valor da Nota:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatarReais(item.invoiceAmount)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Valor Aprovado:</span>
                      <span className="font-mono text-slate-700">
                        {formatarReais(item.approvedAmount)}
                      </span>
                    </div>
                    {divergencia !== 0 && (
                      <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-amber-700">
                        <span>Diferença:</span>
                        <span>{formatarReais(divergencia)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="mt-5 border-t border-slate-100 pt-3">
                  {emConferencia && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAprovar(item)}
                        disabled={processandoId === item.invoiceId}
                        className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-center text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {processandoId === item.invoiceId ? 'Aprovando...' : 'Aprovar NF'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setItemParaRecusa(item)
                          setModalRecusaAberto(true)
                        }}
                        disabled={processandoId === item.invoiceId}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-center text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  )}

                  {prontaPagamento && (
                    <button
                      type="button"
                      onClick={() => handlePagar(item)}
                      disabled={processandoId === item.invoiceId}
                      className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-center text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {processandoId === item.invoiceId ? 'Registrando...' : 'Registrar Pagamento'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Recusa de Nota Fiscal */}
      {modalRecusaAberto && itemParaRecusa && (
        <ModalRejeicaoNF
          aberto={modalRecusaAberto}
          invoiceNumero={itemParaRecusa.invoiceNumber}
          onConfirmar={handleConfirmarRecusa}
          onCancelar={() => {
            setModalRecusaAberto(false)
            setItemParaRecusa(null)
          }}
        />
      )}
    </div>
  )
}
