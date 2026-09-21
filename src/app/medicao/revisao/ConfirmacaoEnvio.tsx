'use client'

import { useState } from 'react'
import Link from 'next/link'
import { enviarMedicao } from '@/app/medicao/acoes'

interface ConfirmacaoEnvioProps {
  measurementId: string
  totalItens: number
}

export function ConfirmacaoEnvio({
  measurementId,
  totalItens,
}: ConfirmacaoEnvioProps) {
  const [modalAberto, setModalAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [protocolo, setProtocolo] = useState<string | null>(null)

  const handleConfirmarEnvio = async () => {
    setEnviando(true)
    setErro(null)

    const res = await enviarMedicao(measurementId)

    if (!res.success || !res.protocol) {
      setErro(res.error ?? 'Ocorreu um erro ao enviar a medição.')
      setEnviando(false)
      setModalAberto(false)
      return
    }

    setProtocolo(res.protocol)
    setEnviando(false)
    setModalAberto(false)
  }

  // Estado de Sucesso após envio
  if (protocolo) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
          Medição enviada com sucesso!
        </h2>

        <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Protocolo
          </p>
          <p data-testid="protocolo-medicao" className="mt-1 font-mono text-xl font-bold text-slate-900">
            {protocolo}
          </p>
        </div>

        <p className="mt-4 text-xs text-slate-600">
          Sua medição foi registrada e agora está em análise pela equipe da obra. Você poderá acompanhar o status na tela inicial.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          Voltar para o início
        </Link>
      </div>
    )
  }

  return (
    <>
      {erro && (
        <div className="mb-4 rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p role="alert" className="text-sm font-semibold text-rose-700">
            {erro}
          </p>
        </div>
      )}

      {/* Barra de ação inferior fixa */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
          >
            Enviar medição para aprovação ({totalItens}{' '}
            {totalItens === 1 ? 'item' : 'itens'})
          </button>
        </div>
      </div>

      {/* Modal de confirmação antes de enviar */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-bold text-slate-900">
              Confirmar envio da medição?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Após o envio, a medição entrará em análise e não poderá mais ser alterada. Deseja prosseguir com o envio de{' '}
              <strong className="font-semibold text-slate-900">
                {totalItens} {totalItens === 1 ? 'item' : 'itens'}
              </strong>
              ?
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                disabled={enviando}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {enviando ? 'Enviando medição...' : 'Sim, confirmar e enviar'}
              </button>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                disabled={enviando}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Revisar mais um pouco
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
