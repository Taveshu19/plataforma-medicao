import { createServerSupabase } from '@/lib/supabase/server'
import { montarTrilha, type PassoTrilha, type NivelAprovacao } from './trilha'

export { formatarReais, competenciaPorExtenso } from './formato'

export interface Resumo {
  contratado: number
  aprovado: number
  emAprovacao: number
  disponivel: number
}

export interface Periodo {
  competencia: string
  fechaEm: string
}

export interface ContextoEmpreiteiro {
  nome: string
  obra: string
  contratoId: string
  contratoNumero: string
  descricao: string | null
  resumo: Resumo
  periodo: Periodo | null
  trilha: PassoTrilha[]
  protocoloAtual: string | null
  /** Rotulo do local nesta obra: casa, apartamento ou pavimento. */
  rotuloLocal: string
}

/**
 * Carrega tudo que a home precisa.
 * Nao filtra por empreiteiro: a RLS do Plano 1 ja garante que este usuario
 * so enxerga o proprio contrato. Se aparecer mais de um, o usuario tem
 * mais de um contrato e mostramos o primeiro — o seletor vem depois.
 */
export async function carregarContexto(): Promise<ContextoEmpreiteiro | null> {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { data: contratos } = await supabase
    .from('contracts')
    .select('id, number, description, project_id, projects(name, unit_label)')
    .order('number')
    .limit(1)

  const contrato = contratos?.[0]
  if (!contrato) return null

  const { data: resumoLinhas } = await supabase.rpc('contract_summary', {
    p_contract_id: contrato.id,
  })
  const linha = Array.isArray(resumoLinhas) ? resumoLinhas[0] : resumoLinhas

  const { data: periodos } = await supabase
    .from('measurement_periods')
    .select('competence, closes_at')
    .eq('project_id', contrato.project_id)
    .lte('opens_at', new Date().toISOString())
    .gte('closes_at', new Date().toISOString())
    .order('competence', { ascending: false })
    .limit(1)

  const periodo = periodos?.[0]
  const projeto = (contrato as { projects?: { name?: string; unit_label?: string } }).projects
  const obra = projeto?.name ?? 'Obra'
  const rotuloLocal = projeto?.unit_label ?? 'local'

  // Trilha de status: progresso da medicao viva + niveis configurados da obra.
  // Os niveis vem do banco para que acrescentar um nivel nao exija mexer na tela.
  const { data: progressoLinhas } = await supabase.rpc('get_current_measurement_progress', {
    p_contract_id: contrato.id,
  })
  const progressoLinha = Array.isArray(progressoLinhas) ? progressoLinhas[0] : progressoLinhas

  const { data: niveisLinhas } = await supabase
    .from('approval_levels')
    .select('level, label')
    .eq('project_id', contrato.project_id)
    .order('level')

  const niveis: NivelAprovacao[] = (niveisLinhas ?? []).map((n) => ({
    level: Number(n.level),
    label: n.label,
  }))

  const trilha = montarTrilha(
    progressoLinha
      ? {
          status: progressoLinha.status,
          currentLevel: Number(progressoLinha.current_level ?? 0),
          protocolo: progressoLinha.protocol ?? null,
          dataPrevistaPagamento: progressoLinha.expected_payment_date ?? null,
        }
      : null,
    niveis,
  )

  return {
    nome: perfil?.full_name ?? user.email ?? 'Empreiteiro',
    obra,
    contratoId: contrato.id,
    contratoNumero: contrato.number,
    descricao: contrato.description,
    resumo: {
      contratado: Number(linha?.contracted ?? 0),
      aprovado: Number(linha?.approved ?? 0),
      emAprovacao: Number(linha?.in_review ?? 0),
      disponivel: Number(linha?.available ?? 0),
    },
    periodo: periodo
      ? { competencia: periodo.competence, fechaEm: periodo.closes_at }
      : null,
    trilha,
    protocoloAtual: progressoLinha?.protocol ?? null,
    rotuloLocal,
  }
}
