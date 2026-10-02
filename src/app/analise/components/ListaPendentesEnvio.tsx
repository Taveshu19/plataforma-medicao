import type { EnvioMedicaoContrato } from '@/lib/aprovacao/dados'
import { competenciaPorExtenso } from '@/app/formato'

function data(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Empreiteiros que ainda não enviaram a medição da competência atual da obra. */
export function ListaPendentesEnvio({
  pendentes,
  total,
}: {
  pendentes: EnvioMedicaoContrato[]
  total: number
}) {
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

  return (
    <div className="space-y-3">
      {pendentes.map((e) => (
        <div
          key={e.contractId}
          data-testid={`pendente-envio-${e.contractNumber}`}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-800">{e.contractorName}</h3>
            <p className="text-xs text-slate-500">
              {e.projectName} • Contrato {e.contractNumber}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                e.measurementStatus === 'RASCUNHO'
                  ? 'bg-amber-50 text-amber-800 ring-amber-200'
                  : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {e.measurementStatus === 'RASCUNHO' ? 'Em rascunho, não enviada' : 'Não iniciada'}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">
              Competência {competenciaPorExtenso(e.competence)} •{' '}
              {e.periodOpen ? `prazo até ${data(e.closesAt)}` : `prazo encerrado em ${data(e.closesAt)}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
