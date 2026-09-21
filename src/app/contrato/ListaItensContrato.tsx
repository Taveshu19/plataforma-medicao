'use client'

import { useState, useMemo } from 'react'
import { GrupoContratoEtapa } from '@/lib/contrato/dados'
import { formatarReais } from '@/app/formato'

interface Props {
  etapas: GrupoContratoEtapa[]
}

export function ListaItensContrato({ etapas }: Props) {
  const [busca, setBusca] = useState('')

  const etapasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return etapas

    return etapas
      .map((etapa) => {
        const locais = etapa.locais
          .map((local) => {
            const itens = local.itens.filter(
              (i) =>
                i.serviceName.toLowerCase().includes(termo) ||
                local.unitName.toLowerCase().includes(termo) ||
                etapa.stageName.toLowerCase().includes(termo),
            )
            return { ...local, itens }
          })
          .filter((l) => l.itens.length > 0)

        return { ...etapa, locais }
      })
      .filter((e) => e.locais.length > 0)
  }, [etapas, busca])

  return (
    <div className="mt-6 space-y-6">
      {/* Busca */}
      <div className="relative">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por serviço, local ou etapa..."
          className="w-full rounded-xl border-0 bg-white px-4 py-3 pl-10 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900"
        />
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
      </div>

      {etapasFiltradas.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            Nenhum serviço ou local encontrado para &ldquo;{busca}&rdquo;.
          </p>
        </div>
      ) : (
        etapasFiltradas.map((etapa) => (
          <div key={etapa.stageName} className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {etapa.stageName}
            </h2>

            {etapa.locais.map((local) => (
              <div
                key={local.unitName}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-800">{local.unitName}</h3>
                </div>

                <div className="divide-y divide-slate-100 px-4">
                  {local.itens.map((item) => {
                    const progressoPct =
                      item.quantity > 0
                        ? Math.min(100, Math.round((item.measuredQty / item.quantity) * 100))
                        : 0

                    return (
                      <div key={item.itemId} className="py-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {item.serviceName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatarReais(item.unitPrice)} / {item.unit}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {progressoPct}% medido
                            </span>
                            <p className="mt-1 text-xs font-medium text-slate-700">
                              Total: {formatarReais(item.totalPrice)}
                            </p>
                          </div>
                        </div>

                        {/* Barra de progresso */}
                        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${progressoPct}%` }}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Contratado: {item.quantity} {item.unit}
                          </span>
                          <span>
                            Medido: {item.measuredQty} {item.unit}
                          </span>
                          <span className="font-semibold text-slate-900">
                            Saldo: {item.balanceQty} {item.unit} ({formatarReais(item.balanceAmount)})
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
