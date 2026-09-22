import { Card } from '@/components/ui'
import { Check, X } from 'lucide-react'
import type { PassoTrilha } from '@/app/trilha'

const CORES = {
  concluido: {
    bolinha: 'bg-emerald-600 ring-emerald-600',
    linha: 'bg-emerald-600',
    texto: 'text-slate-700',
  },
  atual: {
    bolinha: 'bg-white ring-slate-900',
    linha: 'bg-slate-200',
    texto: 'font-semibold text-slate-900',
  },
  pendente: {
    bolinha: 'bg-white ring-slate-300',
    linha: 'bg-slate-200',
    texto: 'text-slate-400',
  },
  devolvido: {
    bolinha: 'bg-rose-600 ring-rose-600',
    linha: 'bg-slate-200',
    texto: 'font-semibold text-rose-700',
  },
} as const

function Marcador({ estado }: { estado: PassoTrilha['estado'] }) {
  const cor = CORES[estado]
  return (
    <span
      aria-hidden
      className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ${cor.bolinha}`}
    >
      {estado === 'concluido' && (
        <Check size={12} className="text-white" />
      )}
      {estado === 'devolvido' && (
        <X size={12} className="text-white" />
      )}
      {estado === 'atual' && <span className="h-2 w-2 rounded-full bg-slate-900" />}
    </span>
  )
}

export function TrilhaStatus({
  passos,
  protocolo,
}: {
  passos: PassoTrilha[]
  protocolo: string | null
}) {
  if (passos.length === 0) return null

  return (
    <Card
      data-testid="trilha-status"
      className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Andamento da medição
        </h2>
        {protocolo && (
          <span className="font-mono text-[11px] text-slate-500">{protocolo}</span>
        )}
      </div>

      <ol className="mt-4 space-y-0">
        {passos.map((passo, i) => {
          const cor = CORES[passo.estado]
          const ultimo = i === passos.length - 1
          return (
            <li key={`${passo.rotulo}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
              {!ultimo && (
                <span
                  aria-hidden
                  className={`absolute left-[9px] top-5 h-full w-0.5 ${cor.linha}`}
                />
              )}
              <Marcador estado={passo.estado} />
              <div className="-mt-0.5 min-w-0">
                <p className={`text-sm leading-6 ${cor.texto}`}>{passo.rotulo}</p>
                {passo.detalhe && (
                  <p className="text-xs text-slate-500">{passo.detalhe}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
