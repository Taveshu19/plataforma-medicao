import Link from 'next/link'
import { redirect } from 'next/navigation'
import { carregarContexto, competenciaPorExtenso, formatarReais } from '@/app/contexto'
import { listarHistoricoMedicoes } from '@/lib/medicao/dados'

function formatarStatus(status: string) {
  switch (status) {
    case 'RASCUNHO':
      return { rotulo: 'Rascunho', cor: 'bg-slate-100 text-slate-700 ring-slate-200' }
    case 'EM_ANALISE':
      return { rotulo: 'Em Análise', cor: 'bg-amber-50 text-amber-800 ring-amber-200' }
    case 'DEVOLVIDA':
      return { rotulo: 'Devolvida', cor: 'bg-rose-50 text-rose-800 ring-rose-200' }
    case 'APROVADA':
      return { rotulo: 'Aprovada', cor: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
    case 'NF_ENVIADA':
      return { rotulo: 'NF Enviada', cor: 'bg-indigo-50 text-indigo-800 ring-indigo-200' }
    case 'NF_APROVADA':
      return { rotulo: 'NF Aprovada', cor: 'bg-teal-50 text-teal-800 ring-teal-200' }
    case 'PAGA':
      return { rotulo: 'Paga', cor: 'bg-blue-50 text-blue-800 ring-blue-200' }
    case 'CANCELADA':
      return { rotulo: 'Cancelada', cor: 'bg-slate-100 text-slate-500 ring-slate-200' }
    default:
      return { rotulo: status, cor: 'bg-slate-100 text-slate-700 ring-slate-200' }
  }
}

export default async function HistoricoMedicoesPage() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const medicoes = await listarHistoricoMedicoes(contexto.contratoId)

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para o início
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Minhas Medições
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {contexto.obra} • Contrato {contexto.contratoNumero}
        </p>
      </header>

      {medicoes.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">
            Você ainda não possui medições registradas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {medicoes.map((med) => {
            const st = formatarStatus(med.status)
            const devolvida = med.status === 'DEVOLVIDA'

            return (
              <article
                key={med.id}
                data-testid={`medicao-card-${med.id}`}
                className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition ${
                  devolvida ? 'ring-rose-300 bg-rose-50/10' : 'ring-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-base font-bold text-slate-900">
                      {med.protocol ?? 'Rascunho'}
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Competência: {competenciaPorExtenso(med.competence)}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.cor}`}
                  >
                    {st.rotulo}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <p className="text-slate-400">Total Solicitado</p>
                    <p className="text-sm font-bold text-slate-800">
                      {formatarReais(med.totalRequested)}
                    </p>
                  </div>

                  {med.status !== 'RASCUNHO' && (
                    <div className="text-right">
                      <p className="text-slate-400">Total Aprovado</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatarReais(med.totalApproved)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Ação para medição aprovada (enviar Nota Fiscal) */}
                {med.status === 'APROVADA' && (
                  <div className="mt-3">
                    <Link
                      href={`/medicoes/${med.id}/nf`}
                      className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      Emitir / Anexar Nota Fiscal
                    </Link>
                  </div>
                )}

                {/* Mensagens de status fiscal */}
                {med.status === 'NF_ENVIADA' && (
                  <div className="mt-3 rounded-xl bg-indigo-50 p-2.5 text-center text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                    Nota Fiscal enviada • Em conferência pelo financeiro
                  </div>
                )}

                {med.status === 'NF_APROVADA' && (
                  <div className="mt-3 rounded-xl bg-teal-50 p-2.5 text-center text-xs font-medium text-teal-700 ring-1 ring-teal-200">
                    Nota Fiscal aprovada • Aguardando liquidação/pagamento
                  </div>
                )}

                {med.status === 'PAGA' && (
                  <div className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-center text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    ✓ Pagamento realizado com sucesso
                  </div>
                )}

                {/* Bloco de alerta para medição devolvida */}
                {devolvida && (
                  <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                      Motivo da Devolução
                    </p>
                    <p className="mt-0.5 text-xs text-rose-900 font-medium">
                      &ldquo;{med.returnReason ?? 'Ajustes solicitados pela engenharia.'}&rdquo;
                    </p>

                    <Link
                      href="/medicao"
                      className="mt-3 flex w-full items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      Revisar e corrigir medição
                    </Link>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
