'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { devolverMedicao } from '@/app/analise/acoes'

interface ModalDevolucaoProps {
  measurementId: string
  aberto: boolean
  onFechar: () => void
}

export function ModalDevolucao({
  measurementId,
  aberto,
  onFechar,
}: ModalDevolucaoProps) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!aberto) return null

  const handleConfirmar = async () => {
    if (!motivo.trim()) {
      setErro('O motivo da devolução é obrigatório.')
      return
    }

    setEnviando(true)
    setErro(null)

    const res = await devolverMedicao(measurementId, motivo.trim())

    if (!res.success) {
      setErro(res.error ?? 'Erro ao devolver a medição.')
      setEnviando(false)
      return
    }

    router.push('/analise')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
        <h3 className="text-lg font-bold text-slate-900">
          Devolver Medição
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Informe ao empreiteiro o motivo pelo qual esta medição está sendo devolvida para correção.
        </p>

        {erro && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
            <p role="alert" className="text-xs font-semibold text-rose-700">
              {erro}
            </p>
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="motivo-devolucao" className="sr-only">
            Motivo da devolução
          </label>
          <textarea
            id="motivo-devolucao"
            rows={4}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value)
              setErro(null)
            }}
            placeholder="Descreva as correções necessárias (ex: metragem de alvenaria incompatível com a visita técnica)..."
            className="w-full rounded-xl border-0 p-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900"
          />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={enviando || !motivo.trim()}
            className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {enviando ? 'Devolvendo medição...' : 'Confirmar Devolução'}
          </button>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
