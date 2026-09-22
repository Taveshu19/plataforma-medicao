'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

/** Marca todos os avisos do usuário como lidos. A RLS restringe aos dele. */
export async function marcarAvisosLidosAction(): Promise<{ success: boolean }> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false }

  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: undefined })
  if (error) return { success: false }

  revalidatePath('/notificacoes')
  revalidatePath('/')
  revalidatePath('/analise')
  return { success: true }
}
