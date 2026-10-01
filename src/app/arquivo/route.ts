import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Abre um arquivo de NF (PDF ou XML) do bucket privado.
 * A RLS do storage só deixa assinar arquivos da própria empresa.
 */
export async function GET(request: NextRequest) {
  const caminho = request.nextUrl.searchParams.get('path')
  if (!caminho) return new NextResponse('Arquivo não informado.', { status: 400 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.storage.from('notas-fiscais').createSignedUrl(caminho, 300)
  if (error || !data?.signedUrl) {
    return new NextResponse('Arquivo não encontrado ou sem permissão.', { status: 404 })
  }
  return NextResponse.redirect(data.signedUrl)
}
