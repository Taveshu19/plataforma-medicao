import Link from 'next/link'
import { redirect } from 'next/navigation'
import { obterPerfilUsuario } from '@/lib/aprovacao/dados'
import { obterPeriodoCorrente, listarSituacaoEmpreiteiros } from '@/lib/prazos/dados'
import { competenciaPorExtenso } from '@/app/formato'
import { PainelPrazos } from './PainelPrazos'

export default async function PrazosPage() {
  // Reabrir prazo e ato da construtora. O banco ja recusa o empreiteiro,
  // mas mandar ele embora aqui evita mostrar uma tela vazia sem explicacao.
  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')
  if (!perfil.isConstrutora) redirect('/')

  const periodo = await obterPeriodoCorrente()
  if (!periodo) redirect('/analise')

  const situacoes = await listarSituacaoEmpreiteiros(periodo.id)

  const agora = Date.now()
  const encerrado = new Date(periodo.closesAt).getTime() < agora
  const pendentes = situacoes.filter((s) => !s.measurementStatus || s.measurementStatus === 'RASCUNHO')

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link
          href="/analise"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para as medições
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Prazos da medição
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {periodo.projectName} • {competenciaPorExtenso(periodo.competence)}
        </p>
      </header>

      <section
        className={`rounded-2xl p-5 ring-1 ${
          encerrado ? 'bg-slate-100 ring-slate-200' : 'bg-emerald-50 ring-emerald-200'
        }`}
      >
        <p className={`text-sm font-semibold ${encerrado ? 'text-slate-700' : 'text-emerald-900'}`}>
          {encerrado ? 'Período encerrado' : 'Período aberto'}
        </p>
        <p className={`mt-1 text-sm ${encerrado ? 'text-slate-600' : 'text-emerald-800'}`}>
          O prazo {encerrado ? 'terminou' : 'termina'} em{' '}
          {new Date(periodo.closesAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
          .
        </p>
        <p className="mt-3 text-xs text-slate-600">
          {situacoes.length - pendentes.length} de {situacoes.length}{' '}
          {situacoes.length === 1 ? 'empreiteiro enviou' : 'empreiteiros enviaram'}
          {pendentes.length > 0 && ` • ${pendentes.length} pendente${pendentes.length > 1 ? 's' : ''}`}
        </p>
      </section>

      {situacoes.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">
            Nenhum contrato vinculado a esta obra.
          </p>
        </div>
      ) : (
        <PainelPrazos periodId={periodo.id} situacoes={situacoes} />
      )}
    </main>
  )
}
