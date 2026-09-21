'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ReaberturaResultado {
  success: boolean
  error?: string
}

/**
 * Reabre o prazo de UM empreiteiro.
 *
 * Nunca do período inteiro: mexer no `closes_at` reabriria para todos os
 * empreiteiros da obra de uma vez. Quem pode reabrir é a equipe da
 * construtora — a verificação vive no banco, não aqui.
 */
export async function reabrirPrazoAction(
  periodId: string,
  contractorId: string,
  ateISO: string,
  motivo: string,
): Promise<ReaberturaResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  if (!motivo || motivo.trim().length < 5) {
    return { success: false, error: 'Descreva o motivo da reabertura.' }
  }

  if (!ateISO) {
    return { success: false, error: 'Informe até quando o prazo fica reaberto.' }
  }

  // A data chega como AAAA-MM-DD do input; vale até o fim daquele dia.
  const ate = new Date(`${ateISO}T23:59:59`)
  if (Number.isNaN(ate.getTime()) || ate.getTime() <= Date.now()) {
    return { success: false, error: 'A data precisa estar no futuro.' }
  }

  const { error } = await supabase.rpc('reopen_period', {
    p_period_id: periodId,
    p_contractor_id: contractorId,
    p_until: ate.toISOString(),
    p_reason: motivo.trim(),
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/analise/prazos')
  revalidatePath('/analise')
  return { success: true }
}
