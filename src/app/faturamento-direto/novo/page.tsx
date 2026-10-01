import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto } from '@/app/contexto'
import { FormularioFaturamentoDireto } from '../FormularioFaturamentoDireto'

export default async function NovoFaturamentoDiretoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link href="/faturamento-direto" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Voltar para Faturamento Direto
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Novo faturamento direto</h1>
        <p className="mt-1 text-xs text-slate-500">
          {contexto.obra} • Contrato {contexto.contratoNumero}
        </p>
      </header>
      <FormularioFaturamentoDireto contractId={contexto.contratoId} />
    </main>
  )
}
