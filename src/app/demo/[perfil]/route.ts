import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ perfil: string }> }
) {
  const { perfil } = await params
  const contas: Record<string, string> = {
    alfa: 'alfa@demo.test',
    empreiteiro: 'alfa@demo.test',
    engenharia: 'engenharia@demo.test',
    engenheiro: 'engenharia@demo.test',
    painel: 'engenharia@demo.test',
    gerencia: 'gerencia@demo.test',
    financeiro: 'gerencia@demo.test',
    beta: 'beta@demo.test',
  }

  const p = perfil?.toLowerCase()
  const email = contas[p] ?? 'alfa@demo.test'
  const supabase = await createServerSupabase()
  await supabase.auth.signInWithPassword({
    email,
    password: 'demo1234',
  })

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') ?? (request.url.startsWith('https') ? 'https' : 'http')
  const baseUrl = host ? `${protocol}://${host}` : request.url

  const targetPath = (p === 'engenharia' || p === 'engenheiro' || p === 'painel')
    ? '/analise'
    : (p === 'gerencia' || p === 'financeiro')
    ? '/faturamento'
    : '/'

  return NextResponse.redirect(new URL(targetPath, baseUrl), { status: 303 })
}
