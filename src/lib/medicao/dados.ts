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

  if (error || !data || data.error) {
    return null
  }

  return {
    id: data.id,
    status: data.status,
    protocol: data.protocol,
    periodId: data.period_id,
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
