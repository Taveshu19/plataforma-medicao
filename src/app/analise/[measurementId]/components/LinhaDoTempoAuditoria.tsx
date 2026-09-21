import { EventoAuditoria } from '@/lib/aprovacao/dados'

interface Props {
  eventos: EventoAuditoria[]
}

function formatarDataHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderizarDetalheEvento(ev: EventoAuditoria) {
  switch (ev.action) {
    case 'ENVIADA':
      return <p className="text-xs text-slate-600">Medição submetida formalmente para análise da engenharia.</p>
    case 'QUANTIDADE_AJUSTADA':
      return (
        <div className="text-xs text-slate-700">
          <span className="font-semibold text-slate-900">{ev.serviceName ?? 'Item'}:</span>{' '}
          quantidade alterada de{' '}
          <span className="font-mono text-slate-500 line-through">{ev.oldValue}</span> para{' '}
          <span className="font-mono font-bold text-emerald-700">{ev.newValue}</span>.
        </div>
      )
    case 'APROVADA':
      return (
        <p className="text-xs text-emerald-800">
          Aprovação registrada {ev.level ? `no Nível ${ev.level}` : ''}.
        </p>
      )
    case 'DEVOLVIDA':
      return (
        <div className="mt-1 rounded-lg bg-rose-50 p-2 text-xs text-rose-900 ring-1 ring-rose-200">
          <span className="font-bold">Motivo:</span> &ldquo;{ev.reason ?? 'Sem motivo informado'}&rdquo;
        </div>
      )
    case 'NF_ENVIADA':
      return (
        <p className="text-xs text-indigo-700">
          Nota Fiscal emitida e anexada pelo empreiteiro (Valor: R$ {Number(ev.newValue).toFixed(2)}).
        </p>
      )
    case 'NF_APROVADA':
      return <p className="text-xs text-teal-800">Nota Fiscal conferida e aprovada pela construtora.</p>
    case 'PAGA':
      return <p className="text-xs font-semibold text-emerald-800">✓ Pagamento liquidado e registrado no extrato.</p>
    default:
      return <p className="text-xs text-slate-600">{ev.action}</p>
  }
}

function obterIconeStatus(action: string) {
  switch (action) {
    case 'ENVIADA':
      return 'bg-blue-500 text-white'
    case 'QUANTIDADE_AJUSTADA':
      return 'bg-amber-500 text-white'
    case 'APROVADA':
    case 'NF_APROVADA':
    case 'PAGA':
      return 'bg-emerald-500 text-white'
    case 'DEVOLVIDA':
      return 'bg-rose-500 text-white'
    case 'NF_ENVIADA':
      return 'bg-indigo-500 text-white'
    default:
      return 'bg-slate-400 text-white'
  }
}

export function LinhaDoTempoAuditoria({ eventos }: Props) {
  if (eventos.length === 0) {
    return null
  }

  return (
    <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
        Histórico e Linha do Tempo ({eventos.length})
      </h3>

      <div className="relative mt-5 space-y-6 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-0.5 before:bg-slate-200">
        {eventos.map((ev) => (
          <div key={ev.id} className="relative flex items-start gap-4">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${obterIconeStatus(
                ev.action,
              )}`}
            >
              <span className="text-[10px] font-black">
                {ev.action === 'DEVOLVIDA'
                  ? '!'
                  : ev.action === 'QUANTIDADE_AJUSTADA'
                  ? '±'
                  : ev.action === 'PAGA' || ev.action === 'APROVADA' || ev.action === 'NF_APROVADA'
                  ? '✓'
                  : '•'}
              </span>
            </div>

            <div className="flex-1 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-100">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <p className="text-xs font-bold text-slate-900">
                  {ev.actorName}{' '}
                  <span className="text-[11px] font-normal capitalize text-slate-500">
                    ({ev.actorRole})
                  </span>
                </p>
                <time className="text-[11px] text-slate-400">
                  {formatarDataHora(ev.createdAt)}
                </time>
              </div>

              <div className="mt-1.5">{renderizarDetalheEvento(ev)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
