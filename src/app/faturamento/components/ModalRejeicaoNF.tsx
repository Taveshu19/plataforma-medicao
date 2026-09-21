'use client'

import { useState } from 'react'

interface ModalRejeicaoNFProps {
  aberto: boolean
  invoiceNumero: string
  onConfirmar: (motivo: string) => Promise<void>
  onCancelar: () => void
}

export function ModalRejeicaoNF({
  aberto,
  invoiceNumero,
  onConfirmar,
  onCancelar,
}: ModalRejeicaoNFProps) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!aberto) return null

  const handleConfirmar = async () => {
    if (!motivo.trim()) {
      setErro('Por favor, informe a justificativa da recusa.')
      return
    }

    setSalvando(true)
    setErro(null)

    try {
      await onConfirmar(motivo.trim())
    } catch (err: any) {
      setErro(err?.message ?? 'Erro ao recusar nota fiscal.')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
        <h3 className="text-lg font-bold text-slate-900">
          Recusar Nota Fiscal nº {invoiceNumero}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Informe o motivo da recusa para que o empreiteiro possa emitir uma nova nota fiscal corrigida. A medição voltará ao status <strong className="text-slate-900">Aprovada</strong>.
        </p>

        {erro && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
            <p className="text-xs font-semibold text-rose-700">{erro}</p>
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="motivo-recusa" className="block text-xs font-semibold text-slate-700">
            Motivo da Recusa *
          </label>
          <textarea
            id="motivo-recusa"
            rows={3}
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: CNPJ do tomador incorreto, valor destacado diverge dos impostos, etc."
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={salvando}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={salvando}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-rose-700 disabled:opacity-50"
          >
            {salvando ? 'Recusando...' : 'Confirmar Recusa'}
          </button>
        </div>
      </div>
    </div>
  )
}
