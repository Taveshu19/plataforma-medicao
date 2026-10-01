import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { carregarContexto, formatarReais } from '@/app/contexto'
import { listarFaturamentosDiretos, TIPOS_FATURAMENTO } from '@/lib/faturamento-direto/dados'
import { SeloStatusFD } from '@/components/FaturamentoDireto'

export default async function FaturamentoDiretoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const itens = await listarFaturamentosDiretos()

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Voltar para o início
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Faturamento Direto</h1>
        <p className="mt-1 text-xs text-slate-500">
          NF de material ou outro faturamento que não depende de medição. Vai só para a aprovação da
          Engenharia e, depois, direto ao Administrativo.
        </p>
      </header>

      <Link
        href="/faturamento-direto/novo"
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
      >
        <Plus size={18} aria-hidden="true" /> Novo faturamento direto
      </Link>

      {itens.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">Nenhum faturamento direto enviado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((fd) => (
            <Link
              key={fd.id}
              href={`/faturamento-direto/${fd.id}`}
              className={`block rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:ring-slate-400 ${
                fd.status === 'DEVOLVIDO' ? 'ring-rose-300' : 'ring-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900">{fd.protocol}</p>
                  <p className="text-xs text-slate-500">
                    NF {fd.number} • {TIPOS_FATURAMENTO[fd.billingType] ?? fd.billingType}
                  </p>
                </div>
                <SeloStatusFD status={fd.status} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-slate-700">{fd.description}</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{formatarReais(fd.amount)}</p>
              {fd.status === 'DEVOLVIDO' && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200">
                  Devolvido: &ldquo;{fd.returnReason}&rdquo; — toque para corrigir
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
