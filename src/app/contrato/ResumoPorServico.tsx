import type { ResumoServico } from '@/lib/contrato/dados'
import { formatarReais } from '@/app/formato'

function quantidade(valor: number, unidade: string): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`
}

function Barra({ executado, total }: { executado: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((executado / total) * 100)) : 0
  return (
    <div className="mt-2.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[11px] font-semibold text-slate-500">
        {pct}% executado
      </p>
    </div>
  )
}

export function ResumoPorServico({ servicos }: { servicos: ResumoServico[] }) {
  if (servicos.length === 0) return null

  return (
    <section data-testid="resumo-por-servico" className="mt-6">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Totais por serviço
      </h2>
      <p className="mt-1 px-1 text-xs text-slate-500">
        Somando todos os locais do contrato.
      </p>

      <div className="mt-3 space-y-3">
        {servicos.map((s) => (
          <article
            key={`${s.serviceName}-${s.unit}`}
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {s.serviceGroup && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {s.serviceGroup}
                  </p>
                )}
                <h3 className="text-base font-semibold text-slate-900">{s.serviceName}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {quantidade(s.totalQuantity, s.unit)} em {s.locations}{' '}
                  {s.locations === 1 ? 'local' : 'locais'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500">Valor total</p>
                <p className="text-sm font-bold tabular-nums text-slate-900">
                  {formatarReais(s.totalAmount)}
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <dt className="text-[11px] text-slate-500">Já executado</dt>
                <dd className="text-sm font-semibold tabular-nums text-emerald-700">
                  {formatarReais(s.measuredAmount)}
                </dd>
                <dd className="text-[11px] text-slate-500">
                  {quantidade(s.measuredQuantity, s.unit)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-[11px] text-slate-500">A receber</dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatarReais(s.balanceAmount)}
                </dd>
                <dd className="text-[11px] text-slate-500">
                  {quantidade(s.balanceQuantity, s.unit)}
                </dd>
              </div>
            </dl>

            <Barra executado={s.measuredQuantity} total={s.totalQuantity} />
          </article>
        ))}
      </div>
    </section>
  )
}
