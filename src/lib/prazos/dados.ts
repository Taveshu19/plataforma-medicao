import { createServerSupabase } from '@/lib/supabase/server'

export interface SituacaoEmpreiteiro {
  contractorId: string
  contractorName: string
  contractId: string
  contractNumber: string
  measurementId: string | null
  measurementStatus: string | null
  protocol: string | null
  periodOpen: boolean
  reopenedUntil: string | null
}

export interface PeriodoCorrente {
  id: string
  projectId: string
  projectName: string
  competence: string
  opensAt: string
  closesAt: string
}

/**
 * O período mais recente das obras que o usuário alcança.
 * A RLS de `measurement_periods` já restringe às obras dele.
 */
export async function obterPeriodoCorrente(): Promise<PeriodoCorrente | null> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('measurement_periods')
    .select('id, project_id, competence, opens_at, closes_at, projects(name)')
    .order('competence', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null

  const p = data[0] as Record<string, unknown>
  const projeto = p.projects as { name?: string } | null

  return {
    id: String(p.id),
    projectId: String(p.project_id),
    projectName: projeto?.name ?? 'Obra',
    competence: String(p.competence),
    opensAt: String(p.opens_at),
    closesAt: String(p.closes_at),
  }
}

export async function listarSituacaoEmpreiteiros(
  periodId: string,
): Promise<SituacaoEmpreiteiro[]> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('get_period_contractors_status', {
    p_period_id: periodId,
  })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map((r) => ({
    contractorId: String(r.contractor_id),
    contractorName: String(r.contractor_name),
    contractId: String(r.contract_id),
    contractNumber: String(r.contract_number),
    measurementId: (r.measurement_id as string | null) ?? null,
    measurementStatus: (r.measurement_status as string | null) ?? null,
    protocol: (r.protocol as string | null) ?? null,
    periodOpen: Boolean(r.period_open),
    reopenedUntil: (r.reopened_until as string | null) ?? null,
  }))
}
