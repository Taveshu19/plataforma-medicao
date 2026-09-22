import Link from 'next/link'
import { Marca } from '@/components/Marca'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { obterPerfilUsuario } from '@/lib/aprovacao/dados'
import { listarNotasPendentes } from '@/lib/faturamento/dados'
import { TabelaFaturamento } from './components/TabelaFaturamento'

export default async function PainelFaturamentoPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/entrar')
  }

  const perfil = await obterPerfilUsuario()

  // Se não for membro da construtora, vai para a home do empreiteiro
  if (!perfil || !perfil.isConstrutora) {
    redirect('/')
  }

  const notas = await listarNotasPendentes()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header Corporativo */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/analise" className="flex items-center gap-2">
              <Marca />
            </Link>

            {/* Navegação Corporativa */}
            <nav className="hidden md:flex items-center gap-1 border-l border-slate-200 pl-6 text-xs font-semibold">
              <Link
                href="/analise"
                className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Aprovações da Engenharia
              </Link>
              <Link
                href="/faturamento"
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-900"
              >
                Faturamento e Notas Fiscais
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-900">{perfil.nome}</p>
              <p className="text-[11px] font-medium text-slate-500 capitalize">
                {perfil.role}
              </p>
            </div>

            <form action="/sair" method="post">
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Painel de Faturamento e Notas Fiscais
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Conferência de notas fiscais recebidas dos empreiteiros e liberação para pagamento.
          </p>
        </div>

        <TabelaFaturamento notas={notas} />
      </main>
    </div>
  )
}
