import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  obterPerfilUsuario,
  obterDetalhesMedicaoAnalise,
  obterLinhaDoTempoAuditoria,
} from '@/lib/aprovacao/dados'
import { competenciaPorExtenso } from '@/app/formato'
import { TabelaAjustes } from './TabelaAjustes'
import { LinhaDoTempoAuditoria } from './components/LinhaDoTempoAuditoria'
import { EvidenciasRecebidas } from './components/EvidenciasRecebidas'
import { listarAnexos } from '@/app/medicao/anexos'

interface PageProps {
  params: Promise<{
    measurementId: string
  }>
}

export default async function AnaliseDetalhePage({ params }: PageProps) {
  const { measurementId } = await params

  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')

  if (!perfil.isConstrutora) {
    redirect('/')
  }

  const dados = await obterDetalhesMedicaoAnalise(measurementId)
  if (!dados) {
    redirect('/analise')
  }

  const eventosAuditoria = await obterLinhaDoTempoAuditoria(measurementId)
  const anexos = await listarAnexos(measurementId)

  // Mapa de item de contrato para nome do servico, para a legenda das fotos.
  const nomePorItem: Record<string, string> = {}
  for (const item of dados.itens) {
    nomePorItem[item.contractItemId] = item.serviceName
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-32 pt-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <Link
            href="/analise"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar para a lista de medições
          </Link>

          <Link
            href={`/medicoes/${measurementId}/espelho`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Ver Espelho / Imprimir
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-900">
                {dados.protocol}
              </h1>
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                Nível {dados.currentLevel}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {dados.contractorName}
            </p>
            <p className="text-xs text-slate-500">
              {dados.projectName} • Contrato {dados.contractNumber}
            </p>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {competenciaPorExtenso(dados.competence)}
            </span>
            {dados.submittedAt && (
              <p className="mt-1 text-[11px] text-slate-400">
                Enviada em {new Date(dados.submittedAt).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </header>

      <TabelaAjustes
        measurementId={measurementId}
        itens={dados.itens}
        totalRequested={dados.totalRequested}
        protocolo={dados.protocol ?? null}
      />

      <EvidenciasRecebidas anexos={anexos} nomePorItem={nomePorItem} />

      <LinhaDoTempoAuditoria eventos={eventosAuditoria} />
    </main>
  )
}
