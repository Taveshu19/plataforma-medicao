'use client'

import { useState } from 'react'
import type { GrupoContratoEtapa } from '@/lib/contrato/dados'
import { ListaItensContrato } from './ListaItensContrato'

/**
 * O detalhe casa a casa nasce recolhido.
 * Foi pedido assim pelo cliente: "se adicionar tudo numa página só ficaria
 * muito longo, por isso a ideia de pôr este botão".
 */
export function DetalhePorLocal({
  etapas,
  rotuloLocal,
}: {
  etapas: GrupoContratoEtapa[]
  rotuloLocal: string
}) {
  const [aberto, setAberto] = useState(false)

  const totalLocais = etapas.reduce((acc, e) => acc + e.locais.length, 0)

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        data-testid="botao-detalhe-por-local"
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-900">
            Executado e a receber por {rotuloLocal}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {totalLocais} {totalLocais === 1 ? 'local' : 'locais'} no contrato
          </span>
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && <ListaItensContrato etapas={etapas} />}
    </section>
  )
}
