'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface AcaoResultado {
  success: boolean
  novoStatus?: string
  error?: string
}

/**
 * Ajusta a quantidade aprovada de um item de medição pela engenharia/coordenação.
 */
export async function ajustarQuantidadeAprovada(
  itemId: string,
  qtyApproved: number,
  measurementId: string,
): Promise<AcaoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Não autenticado.' }
  }

  const { error } = await supabase.rpc('adjust_item_approved_qty', {
    p_item_id: itemId,
    p_qty_approved: qtyApproved,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath(`/analise/${measurementId}`)
  revalidatePath('/analise')
  return { success: true }
}

/**
 * Aprova a medição no nível atual, avançando no fluxo ou finalizando em APROVADA.
 */
export async function aprovarMedicao(measurementId: string): Promise<AcaoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Não autenticado.' }
  }

  const { data: novoStatus, error } = await supabase.rpc('approve_measurement', {
    p_measurement_id: measurementId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath(`/analise/${measurementId}`)
  revalidatePath('/analise')
  revalidatePath('/')
  return { success: true, novoStatus }
}

/**
 * Devolve a medição para o empreiteiro com motivo obrigatório, zerando o nível e gerando auditoria.
 */
export async function devolverMedicao(
  measurementId: string,
  motivo: string,
): Promise<AcaoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Não autenticado.' }
  }

  if (!motivo || motivo.trim().length === 0) {
    return { success: false, error: 'O motivo da devolução é obrigatório.' }
  }

  const { error } = await supabase.rpc('return_measurement', {
    p_measurement_id: measurementId,
    p_reason: motivo.trim(),
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath(`/analise/${measurementId}`)
  revalidatePath('/analise')
  revalidatePath('/')
  return { success: true, novoStatus: 'DEVOLVIDA' }
}
