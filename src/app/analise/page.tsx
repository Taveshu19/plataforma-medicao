import { contarNaoLidos } from '@/lib/notificacoes/dados'
import { redirect } from 'next/navigation'
import { obterPerfilUsuario, listarMedicoesPorStatus, listarSituacaoEnvioMedicao } from '@/lib/aprovacao/dados'
import { TabelaMedicoes } from './components/TabelaMedicoes'
import { CabecalhoCentral } from './components/CabecalhoCentral'
import { listarFaturamentosDiretos } from '@/lib/faturamento-direto/dados'
import { competenciaPorExtenso } from '@/app/formato'

export default async function PainelAnalisePage() {
  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')

  if (!perfil.isConstrutora) {
    redirect('/')
  }

  const [avisosNaoLidos, medicoes, fdLista, envios] = await Promise.all([
    contarNaoLidos(),
    listarMedicoesPorStatus(),
    listarFaturamentosDiretos(['AGUARDANDO_ENGENHARIA']),
    listarSituacaoEnvioMedicao(),
  ])

  // Competência exibida no topo: a mais recente entre as obras acompanhadas.
  const competencia = envios.map((e) => e.competence).sort().at(-1) ?? null

  return (
    <main className="central-workspace mx-auto w-full px-5 pb-16 pt-6">
      <CabecalhoCentral
        nome={perfil.nome}
        role={perfil.role}
        competencia={competencia ? competenciaPorExtenso(competencia) : null}
        avisosNaoLidos={avisosNaoLidos}
        ativo="medicoes"
        fdPendentes={fdLista.length}
      />
      <TabelaMedicoes medicoes={medicoes} envios={envios} />
    </main>
  )
}
