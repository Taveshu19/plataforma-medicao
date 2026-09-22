import Link from 'next/link'
import { Marca } from '@/components/Marca'
import { contarNaoLidos } from '@/lib/notificacoes/dados'
import { redirect } from 'next/navigation'
import { obterPerfilUsuario, listarMedicoesPorStatus } from '@/lib/aprovacao/dados'
import { TabelaMedicoes } from './components/TabelaMedicoes'

export default async function PainelAnalisePage() {
  const perfil = await obterPerfilUsuario()
  const avisosNaoLidos = await contarNaoLidos()
  if (!perfil) redirect('/entrar')

  if (!perfil.isConstrutora) {
    redirect('/')
  }

  const medicoes = await listarMedicoesPorStatus()

  return (
    <>
    <div className="product-bar"><div className="product-bar-inner"><Marca /><span className="product-bar-caption">Gestão da construtora</span></div></div>
    <main className="office-workspace mx-auto w-full px-5 pb-16 pt-8">
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

        <div className="flex items-center gap-4">
          <Link
            href="/notificacoes"
            className="relative rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:ring-slate-400"
          >
            Avisos
            {avisosNaoLidos > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                {avisosNaoLidos > 9 ? '9+' : avisosNaoLidos}
              </span>
            )}
          </Link>

          <Link
            href="/analise/prazos"
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:ring-slate-400"
          >
            Prazos da medição
          </Link>

          <form action="/sair" method="post">
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 underline underline-offset-4 hover:text-slate-900"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <section className="mt-6">
        <TabelaMedicoes medicoes={medicoes} />
      </section>
    </main></>
  )
}
