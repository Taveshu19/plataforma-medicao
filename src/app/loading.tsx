import { Marca } from '@/components/Marca'

export default function Loading() {
  return (
    <main className="mx-auto max-w-md px-5 py-8" role="status" aria-label="Carregando">
      <Marca />
      <p className="mt-8 mb-6 text-sm text-slate-600">Preparando sua obra…</p>
      <div aria-hidden="true" className="space-y-4">
        <div className="skeleton h-40" /><div className="skeleton h-20" /><div className="skeleton h-20" />
      </div>
    </main>
  )
}
