'use client'

import { useState } from 'react'

/**
 * Cancelamento é a única saída para corrigir medição já aprovada.
 * O aviso é forte de propósito: o número do protocolo morre junto e não
 * se reaproveita — é isso que sustenta a rastreabilidade.
 */
export function ModalCancelamento({
  aberto,
  protocolo,
  processando,
  erro,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean
  protocolo: string | null
  processando: boolean
  erro: string | null
  onFechar: () => void
  onConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-rose-700">Cancelar esta medição</h2>

        <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
          <p className="text-xs text-rose-800">
            O saldo volta a ficar disponível e o empreiteiro poderá enviar uma medição
            nova neste período. O protocolo{protocolo ? ` ${protocolo}` : ''} morre com
            ela e não será reaproveitado.
          </p>
        </div>

        <div className="mt-4">
          <label htmlFor="motivo-cancelamento" className="block text-xs font-medium text-slate-700">
            Motivo (obrigatório)
          </label>
          <textarea
            id="motivo-cancelamento"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: medição lançada em duplicidade pelo empreiteiro"
            className="mt-1 w-full rounded-xl border-0 px-3 py-2.5 text-sm shadow-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-rose-600"
          />
        </div>

        {erro && (
          <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">
            {erro}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMotivo('')
              onFechar()
            }}
            disabled={processando}
            className="flex-1 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(motivo)}
            disabled={processando || motivo.trim().length < 5}
            className="flex-1 rounded-xl bg-rose-700 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {processando ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
