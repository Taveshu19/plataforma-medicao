'use client'

import { useState, useMemo } from 'react'
import { ChartColumn, ChevronRight, CircleCheck, Clock3, FileText, FileWarning, Undo2 } from 'lucide-react'
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

export function TabelaMedicoes({ medicoes, envios }: TabelaMedicoesProps) {
  const [busca, setBusca] = useState('')
  // Abre em "Pendentes de envio" quando há quem cobrar; senão no que espera aprovação.
  const [abaAtiva, setAbaAtiva] = useState<AbaFiltro>(() =>
    envios.some((e) => !e.sent) ? 'PENDENTES_ENVIO' : 'EM_ANALISE',
  )

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

  const cards: { aba: AbaFiltro; icone: typeof Clock3; titulo: string; valor: number; cor: string }[] = [
    { aba: 'PENDENTES_ENVIO', icone: FileWarning, titulo: 'Pendentes de envio', valor: pendentesEnvio.length, cor: 'laranja' },
    { aba: 'EM_ANALISE', icone: Clock3, titulo: 'Aguardando aprovação', valor: emAnaliseCount, cor: 'ambar' },
    { aba: 'DEVOLVIDAS', icone: Undo2, titulo: 'Devolvidas', valor: devolvidasCount, cor: 'rosa' },
    { aba: 'APROVADAS', icone: CircleCheck, titulo: 'Aprovadas', valor: aprovadasCount, cor: 'verde' },
    { aba: 'PENDENTES_NF', icone: FileText, titulo: 'Pendentes de NF', valor: pendentesNfCount, cor: 'azul' },
  ]

  const chips: { aba: AbaFiltro; rotulo: string; valor: number }[] = [
    { aba: 'PENDENTES_ENVIO', rotulo: 'Pendentes', valor: pendentesEnvio.length },
    { aba: 'EM_ANALISE', rotulo: 'Em análise', valor: emAnaliseCount },
    { aba: 'DEVOLVIDAS', rotulo: 'Devolvidas', valor: devolvidasCount },
    { aba: 'APROVADAS', rotulo: 'Aprovadas', valor: aprovadasCount },
    { aba: 'PENDENTES_NF', rotulo: 'NF pendente', valor: pendentesNfCount },
  ]

  const TITULO_LISTA: Record<AbaFiltro, string> = {
    PENDENTES_ENVIO: 'Pendentes de envio',
    EM_ANALISE: 'Aguardando aprovação',
    DEVOLVIDAS: 'Devolvidas',
    APROVADAS: 'Aprovadas',
    PENDENTES_NF: 'Pendentes de NF',
    TODAS: 'Todas as medições',
  }

  const contagemLista =
    abaAtiva === 'PENDENTES_ENVIO'
      ? `${enviosFiltrados.length} empreiteiro${enviosFiltrados.length === 1 ? '' : 's'}`
      : `${filtradas.length} medi${filtradas.length === 1 ? 'ção' : 'ções'}`

  const selecionar = (aba: AbaFiltro) => {
    setBusca('')
    setAbaAtiva(aba)
    document.getElementById('lista-central')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-4">
      <div className="central-cards" aria-label="Resumo das medições">
        {cards.map(({ aba, icone: Icone, titulo, valor, cor }) => (
          <button
            key={aba}
            type="button"
            data-testid={`card-resumo-${aba}`}
            aria-pressed={abaAtiva === aba}
            onClick={() => selecionar(aba)}
            className={`central-card central-card-${cor}`}
          >
            <span className="central-card-icone"><Icone size={26} aria-hidden="true" /></span>
            <span className="central-card-texto">
              <span>{titulo}</span>
              <strong>{valor}</strong>
            </span>
            <ChevronRight size={22} aria-hidden="true" className="central-card-seta" />
          </button>
        ))}
      </div>

      <div className="central-resumo">
        <ChartColumn size={22} aria-hidden="true" />
        <p>
          <span className="font-semibold">Resumo do mês:</span>{' '}
          <strong>{pendentesEnvio.length}</strong> empreiteiro{pendentesEnvio.length === 1 ? '' : 's'} sem medição
          <span className="mx-2 text-slate-400">•</span>
          <strong>{pendentesNfCount}</strong> aprovaç{pendentesNfCount === 1 ? 'ão' : 'ões'} sem NF
        </p>
      </div>

      <div className="central-chips" role="tablist" aria-label="Filtrar lista">
        {chips.map(({ aba, rotulo, valor }) => (
          <button
            key={aba}
            type="button"
            role="tab"
            aria-selected={abaAtiva === aba}
            onClick={() => {
              setBusca('')
              setAbaAtiva(aba)
            }}
          >
            {rotulo} ({valor})
          </button>
        ))}
      </div>

      <div id="lista-central" className="central-lista-topo">
        <h2>{busca ? `Histórico • ${busca}` : TITULO_LISTA[abaAtiva]}</h2>
        <span>
          {contagemLista}
          {busca && (
            <button type="button" onClick={() => selecionar('PENDENTES_ENVIO')} className="ml-3 font-semibold text-slate-900 underline underline-offset-4">
              Limpar
            </button>
          )}
        </span>
      </div>

      {abaAtiva === 'PENDENTES_ENVIO' ? (
        <ListaPendentesEnvio pendentes={enviosFiltrados} total={envios.length} onVerHistorico={(nome) => { setBusca(nome); setAbaAtiva('TODAS') }} />
      ) : filtradas.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            {busca
              ? `Nenhuma medição encontrada para "${busca}".`
              : 'Nenhuma medição nesta categoria.'}
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
