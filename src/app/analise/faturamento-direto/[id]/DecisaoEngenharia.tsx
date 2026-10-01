'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { aprovarFaturamentoDiretoAction, devolverFaturamentoDiretoAction } from '@/app/faturamento-direto/acoes'

export function DecisaoEngenharia({ id }: { id: string }) {
  const router = useRouter()
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const aprovar = async () => {
    setProcessando(true)
    setErro(null)
    const r = await aprovarFaturamentoDiretoAction(id)
    if (!r.success) {
      setErro(r.error ?? 'Erro ao aprovar.')
      setProcessando(false)
      return
    }
    router.refresh()
    setProcessando(false)
  }

  const devolver = async () => {
    if (!motivo.trim()) {
      setErro('A justificativa da devolução é obrigatória.')
      return
    }
    setProcessando(true)
    setErro(null)
    const r = await devolverFaturamentoDiretoAction(id, motivo)
    if (!r.success) {
      setErro(r.error ?? 'Erro ao devolver.')
      setProcessando(false)
      return
    }
    setDevolvendo(false)
    setMotivo('')
    router.refresh()
    setProcessando(false)
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-bold text-slate-900">Decisão da Engenharia</h2>
      <p className="mt-1 text-xs text-slate-500">
        Aprovando, a NF segue automaticamente para o Administrativo/Faturamento. Não passa por Coordenação nem Gerência.
      </p>

      {erro && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
          {erro}
        </p>
      )}

      {devolvendo ? (
        <div className="mt-4 space-y-3">
          <label htmlFor="fd-motivo" className="block text-xs font-semibold text-slate-700">
            Justificativa da devolução *
          </label>
          <textarea
            id="fd-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique o que o empreiteiro precisa corrigir."
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={devolver}
              disabled={processando}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {processando ? 'Devolvendo...' : 'Confirmar devolução'}
            </button>
            <button
              type="button"
              onClick={() => setDevolvendo(false)}
              disabled={processando}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={aprovar}
            disabled={processando}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {processando ? 'Aprovando...' : 'Aprovar e enviar ao Administrativo'}
          </button>
          <button
            type="button"
            onClick={() => setDevolvendo(true)}
            disabled={processando}
            className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            Devolver para correção
          </button>
        </div>
      )}
    </section>
  )
}
