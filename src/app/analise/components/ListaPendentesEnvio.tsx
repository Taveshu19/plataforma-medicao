'use client'

import { useState } from 'react'
import { BrickWall, Building2, CalendarDays, EllipsisVertical, HardHat } from 'lucide-react'
import type { EnvioMedicaoContrato } from '@/lib/aprovacao/dados'
import { cobrarEnvioMedicao } from '@/app/analise/acoes'

const ICONES = [HardHat, Building2, BrickWall]

function diaMes(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

/** Empreiteiros que ainda não enviaram a medição da competência atual da obra. */
export function ListaPendentesEnvio({
  pendentes,
  total,
  onVerHistorico,
}: {
  pendentes: EnvioMedicaoContrato[]
  total: number
  onVerHistorico: (contractorName: string) => void
}) {
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [cobrados, setCobrados] = useState<Record<string, boolean>>({})
  const [erro, setErro] = useState<string | null>(null)

  if (pendentes.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-slate-600">
          {total === 0
            ? 'Nenhum empreiteiro com período de medição nas obras que você acompanha.'
            : `Todos os ${total} empreiteiros já enviaram a medição da competência atual.`}
        </p>
      </div>
    )
  }

  const cobrar = async (contractId: string) => {
    setCobrando(contractId)
    setErro(null)
    const r = await cobrarEnvioMedicao(contractId)
    setCobrando(null)
    if (r.success) setCobrados((c) => ({ ...c, [contractId]: true }))
    else setErro(r.error ?? 'Não foi possível enviar a cobrança.')
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
          {erro}
        </p>
      )}
      {pendentes.map((e, i) => {
        const Icone = ICONES[i % ICONES.length]
        const rascunho = e.measurementStatus === 'RASCUNHO'
        return (
          <div key={e.contractId} data-testid={`pendente-envio-${e.contractNumber}`} className="central-item">
            <span className="central-item-icone"><Icone size={26} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h3>{e.contractorName}</h3>
              <p className="central-item-sub">
                {e.projectName} • Contrato {e.contractNumber}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className={`central-pilula ${rascunho ? 'central-pilula-ambar' : ''}`}>
                  <span aria-hidden="true" />
                  {rascunho ? 'Em rascunho' : 'Não enviada'}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarDays size={15} aria-hidden="true" />
                  {e.periodOpen ? 'Prazo até' : 'Prazo encerrou'} {diaMes(e.closesAt)}
                </span>
              </div>
            </div>
            <div className="central-item-acoes">
              <button
                type="button"
                onClick={() => cobrar(e.contractId)}
                disabled={cobrando === e.contractId || cobrados[e.contractId]}
                className="central-botao"
              >
                {cobrados[e.contractId] ? 'Cobrança enviada' : cobrando === e.contractId ? 'Enviando...' : 'Cobrar envio'}
              </button>
              <details className="central-kebab">
                <summary aria-label={`Mais opções para ${e.contractorName}`}>
                  <EllipsisVertical size={20} aria-hidden="true" />
                </summary>
                <div className="central-menu">
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.currentTarget.closest('details')?.removeAttribute('open')
                      onVerHistorico(e.contractorName)
                    }}
                  >
                    Ver medições deste empreiteiro
                  </button>
                </div>
              </details>
            </div>
          </div>
        )
      })}
    </div>
  )
}
