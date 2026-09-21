'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface EnviarNotaInput {
  measurementId: string
  number: string
  issuedOn: string
  amount: number
  pdfPath?: string | null
  xmlPath?: string | null
}

export interface FaturamentoResultado {
  success: boolean
  invoiceId?: string
  error?: string
}

/**
 * Empreiteiro submete a Nota Fiscal para a medição aprovada.
 */
export async function enviarNotaFiscalAction(
  input: EnviarNotaInput,
): Promise<FaturamentoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  if (!input.number || input.number.trim().length === 0) {
    return { success: false, error: 'O número da nota fiscal é obrigatório.' }
  }

  if (!input.issuedOn) {
    return { success: false, error: 'A data de emissão é obrigatória.' }
  }

  if (!input.amount || input.amount <= 0) {
    return { success: false, error: 'O valor da nota deve ser maior que zero.' }
  }

  const { data: invoiceId, error } = await supabase.rpc('submit_invoice', {
    p_measurement_id: input.measurementId,
    p_number: input.number.trim(),
    p_issued_on: input.issuedOn,
    p_amount: input.amount,
    p_pdf: input.pdfPath ?? null,
    p_xml: input.xmlPath ?? null,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/medicoes')
  revalidatePath(`/medicoes/${input.measurementId}/nf`)
  return { success: true, invoiceId: String(invoiceId) }
}

/**
 * Construtora aprova a Nota Fiscal recebida.
 */
export async function aprovarNotaFiscalAction(
  invoiceId: string,
  measurementId: string,
): Promise<FaturamentoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  const { error } = await supabase.rpc('approve_invoice', {
    p_invoice_id: invoiceId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/faturamento')
  revalidatePath('/analise')
  revalidatePath('/')
  return { success: true }
}

/**
 * Construtora rejeita a Nota Fiscal recebida com justificativa obrigatória.
 */
export async function rejeitarNotaFiscalAction(
  invoiceId: string,
  measurementId: string,
  motivo: string,
): Promise<FaturamentoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  if (!motivo || motivo.trim().length === 0) {
    return { success: false, error: 'O motivo da rejeição é obrigatório.' }
  }

  const { error } = await supabase.rpc('reject_invoice', {
    p_invoice_id: invoiceId,
    p_reason: motivo.trim(),
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/faturamento')
  revalidatePath('/analise')
  revalidatePath('/medicoes')
  revalidatePath('/')
  return { success: true }
}

/**
 * Construtora marca a Nota Fiscal e medição como PAGA.
 */
export async function marcarComoPagaAction(
  invoiceId: string,
  measurementId: string,
): Promise<FaturamentoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  const { error } = await supabase.rpc('pay_invoice', {
    p_invoice_id: invoiceId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/faturamento')
  revalidatePath('/analise')
  revalidatePath('/medicoes')
  revalidatePath('/')
  return { success: true }
}
