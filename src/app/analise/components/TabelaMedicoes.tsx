'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { MedicaoPendente } from '@/lib/aprovacao/dados'
import { formatarReais, competenciaPorExtenso } from '@/app/formato'

interface TabelaMedicoesProps {
  medicoes: MedicaoPendente[]
}

export function TabelaMedicoes({ medicoes }: TabelaMedicoesProps) {
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return medicoes
    return medicoes.filter(
      (m) =>
        m.protocol.toLowerCase().includes(termo) ||
        m.contractorName.toLowerCase().includes(termo) ||
        m.projectName.toLowerCase().includes(termo) ||
        m.contractNumber.toLowerCase().includes(termo),
    )
  }, [medicoes, busca])

  return (
    <div className="space-y-4">
      {/* Barra de busca */}
      <div className="relative">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por protocolo, empreiteiro ou obra..."
          className="w-full rounded-xl border-0 bg-white px-4 py-3 pl-10 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900"
        />
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            {busca
              ? `Nenhuma medição encontrada para "${busca}".`
              : 'Nenhuma medição aguardando análise no momento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((med) => (
            <div
              key={med.id}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-slate-900">
                      {med.protocol}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                      Nível {med.currentLevel}
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-slate-800">
                    {med.contractorName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {med.projectName} • Contrato {med.contractNumber}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-500">Total Solicitado</p>
                  <p className="text-base font-bold text-slate-900">
                    {formatarReais(med.totalRequested)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {competenciaPorExtenso(med.competence)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  {med.itemsCount} {med.itemsCount === 1 ? 'item medido' : 'itens medidos'}
                </span>
                <Link
                  href={`/analise/${med.id}`}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Analisar medição
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
