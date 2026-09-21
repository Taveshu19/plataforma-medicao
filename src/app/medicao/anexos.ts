'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

const BUCKET = 'medicao-fotos'
/** Meia hora basta para exibir a foto na tela; depois o link expira sozinho. */
const VALIDADE_LINK_SEGUNDOS = 1800

export interface AnexoMedicao {
  id: string
  contractItemId: string | null
  url: string
  mimeType: string
  sizeBytes: number
}

export interface AnexoResultado {
  success: boolean
  error?: string
}

/**
 * Lista os anexos de uma medição com link temporário para exibição.
 * O bucket é privado: sem link assinado a imagem não abre.
 */
export async function listarAnexos(
  measurementId: string,
  contractItemId?: string | null,
): Promise<AnexoMedicao[]> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('get_measurement_files', {
    p_measurement_id: measurementId,
    p_contract_item_id: contractItemId ?? null,
  })

  if (error || !data) return []

  const linhas = data as Array<Record<string, unknown>>
  const anexos: AnexoMedicao[] = []

  for (const linha of linhas) {
    const { data: assinado } = await supabase.storage
      .from(String(linha.bucket))
      .createSignedUrl(String(linha.path), VALIDADE_LINK_SEGUNDOS)

    if (!assinado?.signedUrl) continue

    anexos.push({
      id: String(linha.id),
      contractItemId: (linha.contract_item_id as string | null) ?? null,
      url: assinado.signedUrl,
      mimeType: String(linha.mime_type),
      sizeBytes: Number(linha.size_bytes),
    })
  }

  return anexos
}

/**
 * Envia a foto ao storage e registra o anexo.
 *
 * O caminho começa com o `company_id` porque é isso que a política de storage
 * exige — é o mesmo isolamento das tabelas, aplicado a arquivos.
 */
export async function anexarFotoAction(
  measurementId: string,
  contractItemId: string | null,
  formData: FormData,
): Promise<AnexoResultado> {
  const arquivo = formData.get('foto') as File | null
  if (!arquivo || arquivo.size === 0) {
    return { success: false, error: 'Nenhuma foto selecionada.' }
  }

  if (!arquivo.type.startsWith('image/')) {
    return { success: false, error: 'Envie uma imagem.' }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  // A empresa vem da própria medição: nunca do cliente, que poderia mentir.
  const { data: medicao } = await supabase
    .from('measurements')
    .select('company_id')
    .eq('id', measurementId)
    .single()

  if (!medicao) {
    return { success: false, error: 'Medição não encontrada.' }
  }

  const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const caminho = `${medicao.company_id}/medicoes/${measurementId}/${Date.now()}-${nomeLimpo}`

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
      contentType: arquivo.type,
      upsert: false,
    })

  if (erroUpload) {
    return { success: false, error: erroUpload.message }
  }

  const { error: erroRegistro } = await supabase.rpc('attach_measurement_file', {
    p_measurement_id: measurementId,
    p_contract_item_id: contractItemId,
    p_bucket: BUCKET,
    p_path: caminho,
    p_mime_type: arquivo.type,
    p_size_bytes: arquivo.size,
  })

  if (erroRegistro) {
    // O arquivo já subiu mas não foi registrado: remove para não deixar lixo órfão.
    await supabase.storage.from(BUCKET).remove([caminho])
    return { success: false, error: erroRegistro.message }
  }

  revalidatePath('/medicao')
  return { success: true }
}

export async function removerAnexoAction(attachmentId: string): Promise<AnexoResultado> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' }
  }

  const { error } = await supabase.rpc('remove_measurement_file', {
    p_attachment_id: attachmentId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/medicao')
  return { success: true }
}
