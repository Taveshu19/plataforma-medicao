'use client'

import { useState, useMemo } from 'react'
import { ClipboardCheck, Clock3, FileWarning, Send, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui'
import Link from 'next/link'
import type { EnvioMedicaoContrato, MedicaoPendente } from '@/lib/aprovacao/dados'
import { formatarReais, competenciaPorExtenso } from '@/app/formato'
import { ListaPendentesEnvio } from './ListaPendentesEnvio'

type AbaFiltro = 'PENDENTES_ENVIO' | 'EM_ANALISE' | 'DEVOLVIDAS' | 'APROVADAS' | 'PENDENTES_NF' | 'TODAS'

interface TabelaMedicoesProps {
  medicoes: MedicaoPendente[]
  envios: EnvioMedicaoContrato[]
}

const APROVADAS = ['APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA']

// Na visão da engenharia o pagamento não aparece: depois da aprovação só
// interessa se o empreiteiro já emitiu a NF.
function obterBadgeStatus(status: string, level: number) {
  switch (status) {
    case 'EM_ANALISE':
      return {
        rotulo: `Nível ${level} • Aguardando aprovação`,
        estilo: 'bg-amber-50 text-amber-800 ring-amber-200',
      }
    case 'APROVADA':
      return {
        rotulo: 'Aprovada • NF pendente',
        estilo: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
      }
    case 'NF_ENVIADA':
    case 'NF_APROVADA':
    case 'PAGA':
      return {
        rotulo: 'Aprovada • NF emitida',
        estilo: 'bg-teal-50 text-teal-800 ring-teal-200',
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

const dois = (n: number) => n.toString().padStart(2, '0')

export function TabelaMedicoes({ medicoes, envios }: TabelaMedicoesProps) {
  const [busca, setBusca] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<AbaFiltro>('EM_ANALISE')

  const pendentesEnvio = useMemo(() => envios.filter((e) => !e.sent), [envios])
  const emAnaliseCount = medicoes.filter((m) => m.status === 'EM_ANALISE').length
  const devolvidasCount = medicoes.filter((m) => m.status === 'DEVOLVIDA').length
  const aprovadasCount = medicoes.filter((m) => APROVADAS.includes(m.status)).length
  const pendentesNfCount = medicoes.filter((m) => m.status === 'APROVADA').length

  const filtradas = useMemo(() => {
    let base = medicoes

    if (abaAtiva === 'EM_ANALISE') {
      base = base.filter((m) => m.status === 'EM_ANALISE')
    } else if (abaAtiva === 'APROVADAS') {
      base = base.filter((m) => APROVADAS.includes(m.status))
    } else if (abaAtiva === 'DEVOLVIDAS') {
      base = base.filter((m) => m.status === 'DEVOLVIDA')
    } else if (abaAtiva === 'PENDENTES_NF') {
      base = base.filter((m) => m.status === 'APROVADA')
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

  const enviosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return pendentesEnvio
    return pendentesEnvio.filter(
      (e) =>
        e.contractorName.toLowerCase().includes(termo) ||
        e.projectName.toLowerCase().includes(termo) ||
        e.contractNumber.toLowerCase().includes(termo),
    )
  }, [pendentesEnvio, busca])

  const cards: { aba: AbaFiltro; icone: typeof Clock3; titulo: string; valor: string; nota: string }[] = [
    {
      aba: 'PENDENTES_ENVIO',
      icone: Send,
      titulo: 'Pendentes de enviar medição',
      valor: dois(pendentesEnvio.length),
      nota: `de ${envios.length} empreiteiro${envios.length === 1 ? '' : 's'}`,
    },
    { aba: 'EM_ANALISE', icone: Clock3, titulo: 'Aguardando aprovação', valor: dois(emAnaliseCount), nota: 'Para conferir' },
    { aba: 'DEVOLVIDAS', icone: Undo2, titulo: 'Devolvidas', valor: dois(devolvidasCount), nota: 'Aguardando correção' },
    { aba: 'APROVADAS', icone: ClipboardCheck, titulo: 'Aprovadas', valor: dois(aprovadasCount), nota: 'Cadeia concluída' },
    {
      aba: 'PENDENTES_NF',
      icone: FileWarning,
      titulo: 'Pendentes de emitir NF',
      valor: dois(pendentesNfCount),
      nota: `de ${aprovadasCount} aprovada${aprovadasCount === 1 ? '' : 's'}`,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="office-stats" role="tablist" aria-label="Resumo das medições">
        {cards.map(({ aba, icone: Icone, titulo, valor, nota }) => (
          <button
            key={aba}
            type="button"
            role="tab"
            aria-selected={abaAtiva === aba}
            data-testid={`card-resumo-${aba}`}
            onClick={() => setAbaAtiva(aba)}
            className={abaAtiva === aba ? 'ativo' : ''}
          >
            <Icone size={20} aria-hidden="true" />
            <span>{titulo}<strong>{valor}</strong></span>
            <small>{nota}</small>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAbaAtiva('TODAS')}
          className={`text-xs font-semibold underline-offset-4 ${
            abaAtiva === 'TODAS' ? 'text-slate-900 underline' : 'text-slate-500 hover:text-slate-900 hover:underline'
          }`}
        >
          Ver todas as medições ({medicoes.length})
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

      {abaAtiva === 'PENDENTES_ENVIO' ? (
        <ListaPendentesEnvio pendentes={enviosFiltrados} total={envios.length} />
      ) : filtradas.length === 0 ? (
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
