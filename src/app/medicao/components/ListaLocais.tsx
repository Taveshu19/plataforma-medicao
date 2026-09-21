'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { LocalMedicao } from '@/lib/medicao/dados'
import { formatarReais } from '@/app/formato'

interface ListaLocaisProps {
  locais: LocalMedicao[]
}

interface EtapaAgrupada {
  stageId: string
  stageName: string
  stagePosition: number
  locais: LocalMedicao[]
}

export function ListaLocais({ locais }: ListaLocaisProps) {
  const [busca, setBusca] = useState('')

  const locaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return locais
    return locais.filter(
      (l) =>
        l.unitName.toLowerCase().includes(termo) ||
        l.stageName.toLowerCase().includes(termo),
    )
  }, [locais, busca])

  const etapas = useMemo(() => {
    const mapa = new Map<string, EtapaAgrupada>()

    for (const local of locaisFiltrados) {
      if (!mapa.has(local.stageId)) {
        mapa.set(local.stageId, {
          stageId: local.stageId,
          stageName: local.stageName,
          stagePosition: local.stagePosition,
          locais: [],
        })
      }
      mapa.get(local.stageId)!.locais.push(local)
    }

    return Array.from(mapa.values()).sort(
      (a, b) => a.stagePosition - b.stagePosition,
    )
  }, [locaisFiltrados])

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="busca-local" className="sr-only">
          Buscar local
        </label>
        <div className="relative">
          <input
            id="busca-local"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por casa, bloco ou etapa..."
            className="w-full rounded-xl border-0 bg-white px-4 py-3.5 pl-10 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900"
          />
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
            <svg
              className="h-4 w-4"
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
          </span>
        </div>
      </div>

      {etapas.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            Nenhum local encontrado para &ldquo;{busca}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {etapas.map((etapa) => (
            <section key={etapa.stageId} className="space-y-2.5">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                {etapa.stageName}
              </h2>
              <div className="space-y-2">
                {etapa.locais.map((local) => {
                  const preenchido = local.measuredItems > 0
                  return (
                    <Link
                      key={local.unitId}
                      href={`/medicao/local/${local.unitId}`}
                      className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-400 active:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-semibold text-slate-900">{local.unitName}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>
                            {local.measuredItems} de {local.totalItems} serviços
                          </span>
                          {preenchido && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-emerald-700">
                                {formatarReais(local.totalMeasured)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {preenchido ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            Preenchido
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                            Pendente
                          </span>
                        )}
                        <svg
                          className="h-4 w-4 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
