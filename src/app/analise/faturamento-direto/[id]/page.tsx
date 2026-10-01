import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Marca } from '@/components/Marca'
import { obterPerfilUsuario } from '@/lib/aprovacao/dados'
import { obterFaturamentoDireto } from '@/lib/faturamento-direto/dados'
import { DadosFaturamentoDireto, HistoricoFaturamentoDireto } from '@/components/FaturamentoDireto'
import { DecisaoEngenharia } from './DecisaoEngenharia'

export default async function AnaliseFaturamentoDiretoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')
  if (!perfil.isConstrutora) redirect(`/faturamento-direto/${id}`)

  const fd = await obterFaturamentoDireto(id)
  if (!fd) redirect('/analise/faturamento-direto')

  const podeDecidir =
    fd.status === 'AGUARDANDO_ENGENHARIA' && ['engenharia', 'admin'].includes(perfil.role)

  return (
    <>
      <div className="product-bar"><div className="product-bar-inner"><Marca /><span className="product-bar-caption">Gestão da construtora</span></div></div>
      <main className="mx-auto w-full max-w-2xl space-y-4 px-5 pb-16 pt-8">
        <Link href="/analise/faturamento-direto" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Voltar para Faturamento Direto
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Análise de faturamento direto</h1>

        <DadosFaturamentoDireto fd={fd} />

        {podeDecidir ? (
          <DecisaoEngenharia id={fd.id} />
        ) : fd.status === 'AGUARDANDO_ENGENHARIA' ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            Aguardando a decisão do engenheiro responsável pela obra.
          </p>
        ) : null}

        <HistoricoFaturamentoDireto eventos={fd.events} />
      </main>
    </>
  )
}
