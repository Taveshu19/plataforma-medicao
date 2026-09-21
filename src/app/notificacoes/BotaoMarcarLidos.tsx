'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarAvisosLidosAction } from './acoes'

export function BotaoMarcarLidos({ naoLidos }: { naoLidos: number }) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()

  if (naoLidos === 0) return null

  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          await marcarAvisosLidosAction()
          router.refresh()
        })
      }
      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:ring-slate-400 disabled:opacity-50"
    >
      {pendente ? 'Marcando…' : 'Marcar todos como lidos'}
    </button>
  )
}
