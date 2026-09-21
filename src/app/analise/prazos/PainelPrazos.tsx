'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SituacaoEmpreiteiro } from '@/lib/prazos/dados'
import { reabrirPrazoAction } from './acoes'

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'Rascunho, não enviou',
  EM_ANALISE: 'Em análise',
  DEVOLVIDA: 'Devolvida para correção',
  APROVADA: 'Aprovada',
  NF_ENVIADA: 'NF enviada',
  NF_APROVADA: 'NF aprovada',
  PAGA: 'Paga',
}

function Etiqueta({ situacao }: { situacao: SituacaoEmpreiteiro }) {
  if (!situacao.measurementStatus) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
        Não enviou
      </span>
    )
  }
  const enviada = situacao.measurementStatus !== 'RASCUNHO'
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        enviada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {ROTULO_STATUS[situacao.measurementStatus] ?? situacao.measurementStatus}
    </span>
  )
}

export function PainelPrazos({
  periodId,
  situacoes,
}: {
  periodId: string
  situacoes: SituacaoEmpreiteiro[]
}) {
  const router = useRouter()
  const [alvo, setAlvo] = useState<SituacaoEmpreiteiro | null>(null)
  const [ate, setAte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [, startTransition] = useTransition()

  const fechar = () => {
    setAlvo(null)
    setAte('')
    setMotivo('')
    setErro(null)
  }

  const confirmar = async () => {
    if (!alvo) return
    setSalvando(true)
    setErro(null)

    const res = await reabrirPrazoAction(periodId, alvo.contractorId, ate, motivo)
    setSalvando(false)

    if (!res.success) {
      setErro(res.error ?? 'Não foi possível reabrir o prazo.')
      return
    }

    setMensagem(`Prazo reaberto para ${alvo.contractorName}.`)
    fechar()
    startTransition(() => router.refresh())
  }

  return (
    <>
      {mensagem && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
        >
          {mensagem}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {situacoes.map((s) => (
          <li
            key={s.contractorId}
            data-testid={`prazo-${s.contractorId}`}
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{s.contractorName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Contrato {s.contractNumber}
                  {s.protocol ? ` • ${s.protocol}` : ''}
                </p>
              </div>
              <Etiqueta situacao={s} />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs">
                {s.periodOpen ? (
                  <span className="font-medium text-emerald-700">Prazo aberto</span>
                ) : (
                  <span className="font-medium text-slate-500">Prazo encerrado</span>
                )}
                {s.reopenedUntil && (
                  <span className="text-slate-500">
                    {' '}
                    • reaberto até{' '}
                    {new Date(s.reopenedUntil).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </p>

              <button
                type="button"
                onClick={() => {
                  setMensagem(null)
                  setAlvo(s)
                }}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Reabrir prazo
              </button>
            </div>
          </li>
        ))}
      </ul>

      {alvo && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">
              Reabrir prazo de {alvo.contractorName}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Só este empreiteiro volta a poder enviar. Os demais seguem com o prazo
              encerrado, e a reabertura fica registrada com o seu nome.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="ate" className="block text-xs font-medium text-slate-700">
                  Reaberto até o fim do dia
                </label>
                <input
                  id="ate"
                  type="date"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                  className="mt-1 w-full rounded-xl border-0 px-3 py-2.5 text-sm shadow-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900"
                />
              </div>

              <div>
                <label htmlFor="motivo" className="block text-xs font-medium text-slate-700">
                  Motivo (obrigatório)
                </label>
                <textarea
                  id="motivo"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: empreiteiro sem sinal na obra no dia do fechamento"
                  className="mt-1 w-full rounded-xl border-0 px-3 py-2.5 text-sm shadow-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900"
                />
              </div>

              {erro && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {erro}
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={fechar}
                disabled={salvando}
                className="flex-1 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={salvando}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {salvando ? 'Reabrindo…' : 'Confirmar reabertura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
