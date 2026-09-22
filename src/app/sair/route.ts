import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const isTunnel = host?.includes('.lhr.life') || host?.includes('.trycloudflare.com') || host?.includes('.loca.lt')
  const protocol = isTunnel ? 'https' : (request.headers.get('x-forwarded-proto') ?? (request.url.startsWith('https') ? 'https' : 'http'))
  const cleanHost = host?.replace(/:\d+$/, '')
  const baseUrl = host ? `${protocol}://${isTunnel ? cleanHost : host}` : request.url
  return NextResponse.redirect(new URL('/entrar', baseUrl), { status: 303 })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
