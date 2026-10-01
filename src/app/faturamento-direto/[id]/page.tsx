import Link from 'next/link'
import { redirect } from 'next/navigation'
import { obterFaturamentoDireto } from '@/lib/faturamento-direto/dados'
import { DadosFaturamentoDireto, HistoricoFaturamentoDireto } from '@/components/FaturamentoDireto'
import { FormularioFaturamentoDireto } from '../FormularioFaturamentoDireto'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ enviado?: string }>
}

export default async function DetalheFaturamentoDiretoPage({ params, searchParams }: Props) {
  const { id } = await params
  const { enviado } = await searchParams
  const fd = await obterFaturamentoDireto(id)
  if (!fd) redirect('/faturamento-direto')

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-16 pt-8">
      <header>
        <Link href="/faturamento-direto" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Voltar para Faturamento Direto
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Faturamento direto</h1>
      </header>

      {enviado && fd.status === 'AGUARDANDO_ENGENHARIA' && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          Enviado! A Nota Fiscal está aguardando a aprovação da Engenharia.
        </div>
      )}

      {fd.status === 'DEVOLVIDO' && (
        <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Devolvido pela Engenharia</p>
          <p className="mt-1 text-sm font-medium text-rose-900">&ldquo;{fd.returnReason}&rdquo;</p>
          <p className="mt-1 text-xs text-rose-800">Corrija os dados abaixo e reenvie.</p>
        </div>
      )}

      <DadosFaturamentoDireto fd={fd} />

      {fd.status === 'DEVOLVIDO' && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Corrigir e reenviar</h2>
          <FormularioFaturamentoDireto
            contractId={fd.contractId}
            existente={{
              id: fd.id,
              tipo: fd.billingType,
              numero: fd.number,
              emitidaEm: fd.issuedOn,
              valor: fd.amount,
              descricao: fd.description,
              observacao: fd.notes,
              temArquivo: Boolean(fd.pdfPath || fd.xmlPath),
            }}
          />
        </section>
      )}

      <HistoricoFaturamentoDireto eventos={fd.events} />
    </main>
  )
}
