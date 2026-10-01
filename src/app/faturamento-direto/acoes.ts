'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ResultadoFD {
  success: boolean
  id?: string
  error?: string
}

/**
 * Sobe o PDF ou XML da NF de faturamento direto. O primeiro segmento do
 * caminho é a empresa da obra, que é o que a RLS do storage confere.
 */
export async function uploadArquivoFDAction(
  contractId: string,
  formData: FormData,
): Promise<{ path?: string; error?: string }> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return {}

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Usuário não autenticado.' }

  const { data: contrato } = await supabase
    .from('contracts')
    .select('company_id')
    .eq('id', contractId)
    .single()
  if (!contrato) return { error: 'Contrato não encontrado.' }

  const nome = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const caminho = `${contrato.company_id}/faturamento-direto/${contractId}/${Date.now()}-${nome}`
  const { error } = await supabase.storage
    .from('notas-fiscais')
    .upload(caminho, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (error) return { error: error.message }
  return { path: caminho }
}

export interface EnviarFDInput {
  id?: string | null
  contractId: string
  tipo: string
  numero: string
  emitidaEm: string
  valor: number
  descricao: string
  observacao?: string | null
  pdfPath?: string | null
  xmlPath?: string | null
}

export async function enviarFaturamentoDiretoAction(input: EnviarFDInput): Promise<ResultadoFD> {
  if (!input.numero.trim()) return { success: false, error: 'Informe o número da Nota Fiscal.' }
  if (!input.descricao.trim()) return { success: false, error: 'A descrição/justificativa é obrigatória.' }
  if (!input.valor || input.valor <= 0) return { success: false, error: 'O valor deve ser maior que zero.' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('submit_direct_billing', {
    p_id: input.id ?? null,
    p_contract_id: input.contractId,
    p_type: input.tipo,
    p_number: input.numero.trim(),
    p_issued_on: input.emitidaEm,
    p_amount: input.valor,
    p_description: input.descricao.trim(),
    p_notes: input.observacao ?? null,
    p_pdf: input.pdfPath ?? null,
    p_xml: input.xmlPath ?? null,
  })
  if (error) {
    const msg = error.message.includes('direct_billings_contract_id_number_key')
      ? 'Já existe um faturamento direto com este número de NF neste contrato.'
      : error.message
    return { success: false, error: msg }
  }

  revalidatePath('/faturamento-direto')
  revalidatePath('/analise/faturamento-direto')
  return { success: true, id: String(data) }
}

export async function aprovarFaturamentoDiretoAction(id: string): Promise<ResultadoFD> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('approve_direct_billing', { p_id: id })
  if (error) return { success: false, error: error.message }
  revalidatePath('/analise/faturamento-direto')
  revalidatePath('/faturamento')
  return { success: true, id }
}

export async function devolverFaturamentoDiretoAction(id: string, motivo: string): Promise<ResultadoFD> {
  if (!motivo.trim()) return { success: false, error: 'A justificativa da devolução é obrigatória.' }
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('return_direct_billing', { p_id: id, p_reason: motivo.trim() })
  if (error) return { success: false, error: error.message }
  revalidatePath('/analise/faturamento-direto')
  revalidatePath('/faturamento-direto')
  return { success: true, id }
}

export async function pagarFaturamentoDiretoAction(id: string): Promise<ResultadoFD> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('pay_direct_billing', { p_id: id })
  if (error) return { success: false, error: error.message }
  revalidatePath('/faturamento')
  revalidatePath('/faturamento-direto')
  return { success: true, id }
}
