'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export interface EstadoLogin {
  erro?: string
}

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')

  if (!email || !senha) {
    return { erro: 'Informe o e-mail e a senha.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    // Nao diferencie "e-mail nao existe" de "senha errada":
    // isso permitiria descobrir quais e-mails estao cadastrados.
    return { erro: 'E-mail ou senha incorretos.' }
  }

  redirect('/')
}
