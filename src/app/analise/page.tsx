import { redirect } from 'next/navigation'
import { obterPerfilUsuario, listarMedicoesPorStatus } from '@/lib/aprovacao/dados'
import { TabelaMedicoes } from './components/TabelaMedicoes'

export default async function PainelAnalisePage() {
  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')

  if (!perfil.isConstrutora) {
    redirect('/')
  }

  const medicoes = await listarMedicoesPorStatus()

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
              {perfil.role}
            </span>
            <nav className="flex items-center gap-2 text-xs font-semibold">
              <span className="text-slate-900 border-b-2 border-slate-900 pb-0.5">Aprovações</span>
              <span className="text-slate-300">•</span>
              <a href="/faturamento" className="text-slate-500 hover:text-slate-900">Faturamento e NFs</a>
            </nav>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Painel de Aprovações
          </h1>
          <p className="text-xs text-slate-500">
            Olá, {perfil.nome} • Construtora
          </p>
        </div>

        <form action="/sair" method="post">
          <button
            type="submit"
            className="text-xs font-medium text-slate-500 underline underline-offset-4 hover:text-slate-900"
          >
            Sair
          </button>
        </form>
      </header>

      <section className="mt-6">
        <TabelaMedicoes medicoes={medicoes} />
      </section>
    </main>
  )
}
