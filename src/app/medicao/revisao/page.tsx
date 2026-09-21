import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto, competenciaPorExtenso, formatarReais } from '@/app/contexto'
import { obterOuCriarRascunho, obterRevisaoMedicao, ItemRevisao } from '@/lib/medicao/dados'
import { ConfirmacaoEnvio } from './ConfirmacaoEnvio'

interface LocalAgrupado {
  unitName: string
  itens: ItemRevisao[]
  totalLocal: number
}

interface EtapaAgrupada {
  stageName: string
  locais: LocalAgrupado[]
}

export default async function RevisaoMedicaoPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  if (!contexto.periodo) redirect('/medicao')

  const rascunho = await obterOuCriarRascunho(contexto.contratoId)
  if (!rascunho) redirect('/medicao')

  // Se já foi enviada e está em análise ou outro status
  if (rascunho.status !== 'RASCUNHO' && rascunho.status !== 'DEVOLVIDA') {
    if (rascunho.status === 'EM_ANALISE') {
      return (
        <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
              Medição enviada com sucesso!
            </h1>

            {rascunho.protocol && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Protocolo
                </p>
                <p data-testid="protocolo-medicao" className="mt-1 font-mono text-xl font-bold text-slate-900">
                  {rascunho.protocol}
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-600">
              Sua medição foi registrada e agora está em análise pela equipe da obra. Você poderá acompanhar o status na tela inicial.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
            >
              Voltar para o início
            </Link>
          </div>
        </main>
      )
    }

    return (
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-bold text-slate-900">
            Medição já enviada
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta medição já foi submetida e encontra-se no status{' '}
            <strong className="font-semibold text-slate-900">{rascunho.status}</strong>.
          </p>
          {rascunho.protocol && (
            <p className="mt-4 font-mono text-sm font-bold text-slate-800">
              Protocolo: {rascunho.protocol}
            </p>
          )}
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Voltar para o início
          </Link>
        </div>
      </main>
    )
  }

  const itens = await obterRevisaoMedicao(rascunho.id)

  if (itens.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-bold text-slate-900">
            Nenhum serviço medido
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Você ainda não informou quantidades para nenhum serviço nesta medição.
          </p>
          <Link
            href="/medicao"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Voltar para os locais
          </Link>
        </div>
      </main>
    )
  }

  const totalGeral = itens.reduce((acc, it) => acc + it.subtotal, 0)

  // Agrupamento por Etapa -> Local
  const etapasMapa = new Map<string, Map<string, ItemRevisao[]>>()
  for (const item of itens) {
    if (!etapasMapa.has(item.stageName)) {
      etapasMapa.set(item.stageName, new Map())
    }
    const locaisMapa = etapasMapa.get(item.stageName)!
    if (!locaisMapa.has(item.unitName)) {
      locaisMapa.set(item.unitName, [])
    }
    locaisMapa.get(item.unitName)!.push(item)
  }

  const etapas: EtapaAgrupada[] = Array.from(etapasMapa.entries()).map(
    ([stageName, locaisMap]) => ({
      stageName,
      locais: Array.from(locaisMap.entries()).map(([unitName, lista]) => ({
        unitName,
        itens: lista,
        totalLocal: lista.reduce((sum, i) => sum + i.subtotal, 0),
      })),
    }),
  )

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
      <header className="mb-6">
        <Link
          href="/medicao"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para os locais
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Revisão da Medição
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {contexto.obra} • {competenciaPorExtenso(contexto.periodo.competencia)}
        </p>
      </header>

      {/* Card do total da medição */}
      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Valor Total da Medição
        </p>
        <p className="mt-1 text-2xl font-extrabold text-slate-900">
          {formatarReais(totalGeral)}
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Total de {itens.length} {itens.length === 1 ? 'serviço medido' : 'serviços medidos'} nesta competência.
        </p>
      </section>

      {/* Detalhamento por etapas e locais */}
      <section className="space-y-6">
        {etapas.map((etapa) => (
          <div key={etapa.stageName} className="space-y-3">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              {etapa.stageName}
            </h2>

            {etapa.locais.map((local) => (
              <div
                key={local.unitName}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {local.unitName}
                  </h3>
                  <span className="text-xs font-bold text-slate-700">
                    {formatarReais(local.totalLocal)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 px-4">
                  {local.itens.map((item) => (
                    <div key={item.measurementItemId} className="py-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {item.serviceName}
                        </span>
                        <span className="font-bold text-slate-900">
                          {formatarReais(item.subtotal)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-slate-500">
                        <span>
                          {item.qtyRequested.toLocaleString('pt-BR')} {item.unit} × {formatarReais(item.unitPrice)}
                        </span>
                        {item.notes && (
                          <span className="italic text-slate-400">
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Ação de confirmação e envio */}
      <div className="mt-8">
        <ConfirmacaoEnvio
          measurementId={rascunho.id}
          totalItens={itens.length}
        />
      </div>
    </main>
  )
}
