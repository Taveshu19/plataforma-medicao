import { createServerSupabase } from '@/lib/supabase/server'

export interface MedicaoPendente {
  id: string
  protocol: string
  status: string
  currentLevel: number
  submittedAt: string | null
  projectId: string
  projectName: string
  contractId: string
  contractNumber: string
  contractorId: string
  contractorName: string
  competence: string
  totalRequested: number
  totalApproved: number
  itemsCount: number
}

export interface ItemAnalise {
  itemId: string
  contractItemId: string
  stageName: string
  unitName: string
  serviceName: string
  serviceGroup: string | null
  unit: string
  unitPrice: number
  unitQuantity: number
  contractBalance: number
  qtyRequested: number
  qtyApproved: number
  subtotalRequested: number
  subtotalApproved: number
  notes: string | null
}

export interface DetalhesMedicaoAnalise {
  id: string
  protocol: string
  status: string
  currentLevel: number
  submittedAt: string | null
  contractorName: string
  contractNumber: string
  projectName: string
  competence: string
  itens: ItemAnalise[]
  totalRequested: number
  totalApproved: number
}

export interface PerfilUsuario {
  id: string
  nome: string
  isConstrutora: boolean
  role: string
}

/**
 * Identifica o papel do usuário autenticado (se é membro interno da construtora ou empreiteiro).
 */
export async function obterPerfilUsuario(): Promise<PerfilUsuario | null> {
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

  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, contractor_id')
    .eq('user_id', user.id)
    .limit(1)

  const membership = memberships?.[0]
  if (!membership) return null

  return {
    id: user.id,
    nome: perfil?.full_name ?? user.email ?? 'Usuário',
    isConstrutora: membership.contractor_id === null,
    role: membership.role,
  }
}

/**
 * Lista medições em análise visíveis para o usuário autenticado da construtora.
 */
export async function listarMedicoesPendentes(): Promise<MedicaoPendente[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_pending_measurements')

  if (error || !data) return []

  return data.map((r: any) => ({
    id: r.id,
    protocol: r.protocol,
    status: r.status,
    currentLevel: r.current_level,
    submittedAt: r.submitted_at,
    projectId: r.project_id,
    projectName: r.project_name,
    contractId: r.contract_id,
    contractNumber: r.contract_number,
    contractorId: r.contractor_id,
    contractorName: r.contractor_name,
    competence: r.competence,
    totalRequested: Number(r.total_requested),
    totalApproved: Number(r.total_approved),
    itemsCount: Number(r.items_count),
  }))
}

/**
 * Obtém os detalhes consolidados de uma medição para análise da engenharia.
 */
export async function obterDetalhesMedicaoAnalise(
  measurementId: string,
): Promise<DetalhesMedicaoAnalise | null> {
  const supabase = await createServerSupabase()

  // Consulta metadados da medição
  const { data: med, error: medErr } = await supabase
    .from('measurements')
    .select(`
      id, protocol, status, current_level, submitted_at,
      contracts (
        number,
        contractors ( name ),
        projects ( name )
      ),
      measurement_periods ( competence )
    `)
    .eq('id', measurementId)
    .single()

  if (medErr || !med) return null

  // Consulta itens detalhados via RPC
  const { data: itensRaw, error: itensErr } = await supabase.rpc(
    'get_measurement_analysis_details',
    { p_measurement_id: measurementId },
  )

  if (itensErr || !itensRaw) return null

  const itens: ItemAnalise[] = itensRaw.map((r: any) => ({
    itemId: r.item_id,
    contractItemId: r.contract_item_id,
    stageName: r.stage_name,
    unitName: r.unit_name,
    serviceName: r.service_name,
    serviceGroup: r.service_group,
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    unitQuantity: Number(r.unit_quantity),
    contractBalance: Number(r.contract_balance),
    qtyRequested: Number(r.qty_requested),
    qtyApproved: Number(r.qty_approved),
    subtotalRequested: Number(r.subtotal_requested),
    subtotalApproved: Number(r.subtotal_approved),
    notes: r.notes,
  }))

  const totalRequested = itens.reduce((sum, i) => sum + i.subtotalRequested, 0)
  const totalApproved = itens.reduce((sum, i) => sum + i.subtotalApproved, 0)

  const contract = med.contracts as any
  const contractor = contract?.contractors as any
  const project = contract?.projects as any
  const period = med.measurement_periods as any

  return {
    id: med.id,
    protocol: med.protocol ?? 'Rascunho',
    status: med.status,
    currentLevel: med.current_level,
    submittedAt: med.submitted_at,
    contractorName: contractor?.name ?? 'Empreiteiro',
    contractNumber: contract?.number ?? '',
    projectName: project?.name ?? 'Obra',
    competence: period?.competence ?? '',
    itens,
    totalRequested,
    totalApproved,
  }
}

export interface EventoAuditoria {
  id: string
  action: string
  actorName: string
  actorRole: string
  level: number | null
  oldValue: string | null
  newValue: string | null
  reason: string | null
  serviceName: string | null
  createdAt: string
}

/**
 * Retorna a linha do tempo cronológica de auditoria de uma medição.
 */
export async function obterLinhaDoTempoAuditoria(
  measurementId: string,
): Promise<EventoAuditoria[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_measurement_audit_timeline', {
    p_measurement_id: measurementId,
  })

  if (error || !data) return []

  return data.map((d: any) => ({
    id: d.id,
    action: d.action,
    actorName: d.actor_name,
    actorRole: d.actor_role,
    level: d.level,
    oldValue: d.old_value,
    newValue: d.new_value,
    reason: d.reason,
    serviceName: d.service_name,
    createdAt: d.created_at,
  }))
}

/**
 * Lista medições da construtora com filtro opcional por status ('EM_ANALISE', 'APROVADAS', 'DEVOLVIDAS', etc).
 */
export async function listarMedicoesPorStatus(
  status?: string,
): Promise<MedicaoPendente[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_company_measurements', {
    p_status: status ?? null,
  })

  if (error || !data) return []

  return data.map((r: any) => ({
    id: r.id,
    protocol: r.protocol,
    status: r.status,
    currentLevel: r.current_level,
    submittedAt: r.submitted_at,
    projectId: r.project_id,
    projectName: r.project_name,
    contractId: r.contract_id,
    contractNumber: r.contract_number,
    contractorId: r.contractor_id,
    contractorName: r.contractor_name,
    competence: r.competence,
    totalRequested: Number(r.total_requested),
    totalApproved: Number(r.total_approved),
    itemsCount: Number(r.items_count),
  }))
}

