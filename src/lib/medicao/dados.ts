import { createServerSupabase } from '@/lib/supabase/server'

export interface RascunhoMedicao {
  id: string
  status: string
  protocol: string | null
  periodId: string
  error?: string
}

export interface LocalMedicao {
  stageId: string
  stageName: string
  stagePosition: number
  unitId: string
  unitName: string
  unitPosition: number
  totalItems: number
  measuredItems: number
  totalContracted: number
  totalMeasured: number
}

export interface ServicoLocal {
  contractItemId: string
  serviceName: string
  serviceGroup: string | null
  unit: string
  quantity: number
  unitPrice: number
  balance: number
  measuredQty: number
  subtotal: number
  notes: string | null
}

export interface ItemRevisao {
  measurementItemId: string
  contractItemId: string
  stageName: string
  unitName: string
  serviceName: string
  serviceGroup: string | null
  unit: string
  unitPrice: number
  qtyRequested: number
  subtotal: number
  notes: string | null
}

export async function obterOuCriarRascunho(contractId: string): Promise<RascunhoMedicao | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_or_create_draft', {
    p_contract_id: contractId,
  })

  const res = data as any
  if (error || !res || res.error) {
    return null
  }

  return {
    id: res.id,
    status: res.status,
    protocol: res.protocol,
    periodId: res.period_id,
  }
}

export async function listarLocaisMedicao(measurementId: string): Promise<LocalMedicao[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_measurement_stages_and_units', {
    p_measurement_id: measurementId,
  })

  if (error || !data) return []

  return data.map((r: any) => ({
    stageId: r.stage_id,
    stageName: r.stage_name,
    stagePosition: r.stage_position,
    unitId: r.unit_id,
    unitName: r.unit_name,
    unitPosition: r.unit_position,
    totalItems: Number(r.total_items),
    measuredItems: Number(r.measured_items),
    totalContracted: Number(r.total_contracted),
    totalMeasured: Number(r.total_measured),
  }))
}

export async function listarServicosLocal(
  measurementId: string,
  unitId: string,
): Promise<ServicoLocal[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_unit_services_for_measurement', {
    p_measurement_id: measurementId,
    p_unit_id: unitId,
  })

  if (error || !data) return []

  return data.map((r: any) => ({
    contractItemId: r.contract_item_id,
    serviceName: r.service_name,
    serviceGroup: r.service_group,
    unit: r.unit,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    balance: Number(r.balance),
    measuredQty: Number(r.measured_qty),
    subtotal: Number(r.subtotal),
    notes: r.notes,
  }))
}

export async function obterRevisaoMedicao(measurementId: string): Promise<ItemRevisao[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_measurement_review', {
    p_measurement_id: measurementId,
  })

  if (error || !data) return []

  return data.map((r: any) => ({
    measurementItemId: r.measurement_item_id,
    contractItemId: r.contract_item_id,
    stageName: r.stage_name,
    unitName: r.unit_name,
    serviceName: r.service_name,
    serviceGroup: r.service_group,
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    qtyRequested: Number(r.qty_requested),
    subtotal: Number(r.subtotal),
    notes: r.notes,
  }))
}

export interface HistoricoMedicao {
  id: string
  protocol: string | null
  status: string
  currentLevel: number
  submittedAt: string | null
  createdAt: string
  competence: string
  totalRequested: number
  totalApproved: number
  returnReason?: string | null
}

export async function listarHistoricoMedicoes(contractId: string): Promise<HistoricoMedicao[]> {
  const supabase = await createServerSupabase()

  const { data: medicoes, error } = await supabase
    .from('measurements')
    .select(`
      id, protocol, status, current_level, submitted_at, created_at,
      measurement_periods ( competence ),
      measurement_items (
        qty_requested,
        qty_approved,
        contract_items ( unit_price )
      )
    `)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })

  if (error || !medicoes) return []

  const idsDevolvidas = medicoes.filter((m) => m.status === 'DEVOLVIDA').map((m) => m.id)
  const motivosMap = new Map<string, string>()

  if (idsDevolvidas.length > 0) {
    const { data: audits } = await supabase
      .from('audit_log')
      .select('measurement_id, reason')
      .in('measurement_id', idsDevolvidas)
      .eq('action', 'DEVOLVIDA')
      .not('reason', 'is', null)
      .order('created_at', { ascending: false })

    if (audits) {
      for (const a of audits) {
        if (a.measurement_id && a.reason && !motivosMap.has(a.measurement_id)) {
          motivosMap.set(a.measurement_id, a.reason)
        }
      }
    }
  }

  return medicoes.map((m: any) => {
    const period = m.measurement_periods as any
    const items = (m.measurement_items as any[]) || []

    const totalRequested = items.reduce((sum, it) => {
      const price = Number(it.contract_items?.unit_price ?? 0)
      return sum + Number(it.qty_requested) * price
    }, 0)

    const totalApproved = items.reduce((sum, it) => {
      const price = Number(it.contract_items?.unit_price ?? 0)
      const qty = it.qty_approved !== null ? Number(it.qty_approved) : Number(it.qty_requested)
      return sum + qty * price
    }, 0)

    return {
      id: m.id,
      protocol: m.protocol,
      status: m.status,
      currentLevel: m.current_level,
      submittedAt: m.submitted_at,
      createdAt: m.created_at,
      competence: period?.competence ?? '',
      totalRequested,
      totalApproved,
      returnReason: motivosMap.get(m.id) ?? null,
    }
  })
}

