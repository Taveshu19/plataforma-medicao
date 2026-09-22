import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  await supabase.auth.signInWithPassword({
    email: 'engenharia@demo.test',
    password: 'demo1234',
  })

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') ?? (request.url.startsWith('https') ? 'https' : 'http')
  const baseUrl = host ? `${protocol}://${host}` : request.url

  return NextResponse.redirect(new URL('/analise', baseUrl), { status: 303 })
}
