import { formatarReais } from '@/app/formato'

export function Dinheiro({
  rotulo,
  valor,
  destaque = false,
  cor = 'neutro',
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  cor?: 'neutro' | 'positivo' | 'atencao'
}) {
  const cores = {
    neutro: 'text-slate-900',
    positivo: 'text-emerald-700',
    atencao: 'text-amber-700',
  } as const

  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="text-sm text-slate-600">{rotulo}</span>
      <span
        className={`tabular-nums ${cores[cor]} ${
          destaque ? 'text-2xl font-bold' : 'text-lg font-semibold'
        }`}
      >
        {formatarReais(valor)}
      </span>
    </div>
  )
}
