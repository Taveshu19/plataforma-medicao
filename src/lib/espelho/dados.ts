import { createServerSupabase } from '@/lib/supabase/server'

export interface ItemEspelho {
  id: string
  stage_name: string
  unit_name: string
  service_name: string
  service_group: string | null
  unit: string
  unit_price: number
  contract_quantity: number
  qty_requested: number
  qty_approved: number
  subtotal_requested: number
  subtotal_approved: number
  notes: string | null
}

export interface EspelhoMedicao {
  id: string
  protocol: string
  status: string
  current_level: number
  submitted_at: string | null
  competence: string
  company_name: string
  project_name: string
  contract_number: string
  contract_description: string | null
  contractor_name: string
  contractor_document: string | null
  total_requested: number
  total_approved: number
  invoice_number: string | null
  invoice_amount: number | null
  invoice_issued_on: string | null
  invoice_status: string | null
  items: ItemEspelho[]
}

export async function obterEspelhoMedicao(
  measurementId: string,
): Promise<EspelhoMedicao | null> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('get_measurement_statement', {
    p_measurement_id: measurementId,
  })

  if (error || !data) {
    return null
  }

  return data as EspelhoMedicao
}
