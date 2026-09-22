'use client'

import { useState, useMemo } from 'react'
import { ClipboardCheck, Clock3, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui'
import Link from 'next/link'
import { MedicaoPendente } from '@/lib/aprovacao/dados'
import { formatarReais, competenciaPorExtenso } from '@/app/formato'

type AbaFiltro = 'EM_ANALISE' | 'APROVADAS' | 'DEVOLVIDAS' | 'TODAS'

interface TabelaMedicoesProps {
  medicoes: MedicaoPendente[]
}

function obterBadgeStatus(status: string, level: number) {
  switch (status) {
    case 'EM_ANALISE':
      return {
        rotulo: `Nível ${level} • Em análise`,
        estilo: 'bg-amber-50 text-amber-800 ring-amber-200',
      }
    case 'APROVADA':
      return {
        rotulo: 'Aprovada',
        estilo: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
      }
    case 'NF_ENVIADA':
      return {
        rotulo: 'NF em conferência',
        estilo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
      }
    case 'NF_APROVADA':
      return {
        rotulo: 'Pronta p/ pagamento',
        estilo: 'bg-teal-50 text-teal-800 ring-teal-200',
      }
    case 'PAGA':
      return {
        rotulo: 'Paga / Liquidada',
        estilo: 'bg-blue-50 text-blue-800 ring-blue-200',
      }
    case 'DEVOLVIDA':
      return {
        rotulo: 'Devolvida',
        estilo: 'bg-rose-50 text-rose-800 ring-rose-200',
      }
    default:
      return {
        rotulo: status,
        estilo: 'bg-slate-100 text-slate-700 ring-slate-200',
      }
  }
}

export function TabelaMedicoes({ medicoes }: TabelaMedicoesProps) {
  const [busca, setBusca] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<AbaFiltro>('EM_ANALISE')

  const emAnaliseCount = useMemo(
    () => medicoes.filter((m) => m.status === 'EM_ANALISE').length,
    [medicoes],
  )
  const aprovadasCount = useMemo(
    () =>
      medicoes.filter((m) =>
        ['APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'].includes(m.status),
      ).length,
    [medicoes],
  )
  const devolvidasCount = useMemo(
    () => medicoes.filter((m) => m.status === 'DEVOLVIDA').length,
    [medicoes],
  )
  const todasCount = medicoes.length

  const filtradas = useMemo(() => {
    let base = medicoes

    if (abaAtiva === 'EM_ANALISE') {
      base = base.filter((m) => m.status === 'EM_ANALISE')
    } else if (abaAtiva === 'APROVADAS') {
      base = base.filter((m) =>
        ['APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'].includes(m.status),
      )
    } else if (abaAtiva === 'DEVOLVIDAS') {
      base = base.filter((m) => m.status === 'DEVOLVIDA')
    }

    const termo = busca.trim().toLowerCase()
    if (!termo) return base

    return base.filter(
      (m) =>
        m.protocol.toLowerCase().includes(termo) ||
        m.contractorName.toLowerCase().includes(termo) ||
        m.projectName.toLowerCase().includes(termo) ||
        m.contractNumber.toLowerCase().includes(termo),
    )
  }, [medicoes, abaAtiva, busca])

  return (
    <div className="space-y-4">
      <div className="office-stats" aria-label="Resumo das medições">
        <div><Clock3 size={20} aria-hidden="true" /><span>Aguardando análise<strong>{emAnaliseCount.toString().padStart(2, '0')}</strong></span><small>Para conferir</small></div>
        <div><ClipboardCheck size={20} aria-hidden="true" /><span>Aprovadas / Pagas<strong>{aprovadasCount.toString().padStart(2, '0')}</strong></span><small>Etapas concluídas</small></div>
        <div><Undo2 size={20} aria-hidden="true" /><span>Devolvidas<strong>{devolvidasCount.toString().padStart(2, '0')}</strong></span><small>Aguardando correção</small></div>
      </div>
      {/* Abas por Status */}
      <div className="status-tabs flex flex-wrap border-b border-slate-200 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setAbaAtiva('EM_ANALISE')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition ${
            abaAtiva === 'EM_ANALISE'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Em Análise
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              abaAtiva === 'EM_ANALISE'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {emAnaliseCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('APROVADAS')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition ${
            abaAtiva === 'APROVADAS'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Aprovadas / Pagas
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              abaAtiva === 'APROVADAS'
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {aprovadasCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('DEVOLVIDAS')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition ${
            abaAtiva === 'DEVOLVIDAS'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Devolvidas
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              abaAtiva === 'DEVOLVIDAS'
                ? 'bg-rose-100 text-rose-900'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {devolvidasCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('TODAS')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition ${
            abaAtiva === 'TODAS'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Todas
          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
            {todasCount}
          </span>
        </button>
      </div>

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
              : 'Nenhuma medição encontrada nesta categoria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((med) => {
            const badge = obterBadgeStatus(med.status, med.currentLevel)
            const isEmAnalise = med.status === 'EM_ANALISE'

            return (
              <div
                key={med.id}
                data-testid={`card-medicao-${med.protocol}`}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-900">
                        {med.protocol}
                      </span>
                      <Badge className={badge.estilo}>{badge.rotulo}</Badge>
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      {med.itemsCount} {med.itemsCount === 1 ? 'item medido' : 'itens medidos'}
                    </span>
                    <span>•</span>
                    <Link
                      href={`/medicoes/${med.id}/espelho`}
                      target="_blank"
                      className="font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      Espelho Oficial
                    </Link>
                  </div>

                  <Link
                    href={`/analise/${med.id}`}
                    className={`inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition ${
                      isEmAnalise
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {isEmAnalise ? 'Analisar medição' : 'Conferir detalhes'}
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
