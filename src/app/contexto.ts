import { createServerSupabase } from '@/lib/supabase/server'

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
    .select('id, number, description, project_id, projects(name)')
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
  const obra = (contrato as { projects?: { name?: string } }).projects?.name ?? 'Obra'

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
  }
}
