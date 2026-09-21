'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ItemMedicaoInput {
  contractItemId: string
  qtyRequested: number
  notes?: string | null
}

export interface SalvarResultado {
  success: boolean
  error?: string
}

export interface EnviarResultado {
  success: boolean
  protocol?: string
  error?: string
}

/**
 * Salva ou remove itens de medição no rascunho de forma atômica via RLS e RPC.
 */
export async function salvarMedicaoLocal(
  measurementId: string,
  itens: ItemMedicaoInput[],
): Promise<SalvarResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  const payload = itens.map((it) => ({
    contract_item_id: it.contractItemId,
    qty_requested: Number(it.qtyRequested) || 0,
    notes: it.notes ?? null,
  }))

  const { error } = await supabase.rpc('save_measurement_items', {
    p_measurement_id: measurementId,
    p_items: payload,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/medicao')
  return { success: true }
}

/**
 * Envia formalmente a medição em rascunho, avançando para EM_ANALISE e gerando protocolo sequencial.
 */
export async function enviarMedicao(measurementId: string): Promise<EnviarResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  const { data, error } = await supabase.rpc('submit_measurement', {
    p_measurement_id: measurementId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/medicao')
  return { success: true, protocol: String(data) }
}
