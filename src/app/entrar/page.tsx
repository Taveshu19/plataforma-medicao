'use client'

import { useActionState } from 'react'
import { entrar, type EstadoLogin } from './acoes'

const ESTADO_INICIAL: EstadoLogin = {}

export default function Entrar() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL)

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Medição</h1>
        <p className="mt-2 text-slate-600">Entre para ver seu contrato e enviar sua medição.</p>

        <form action={acao} className="mt-10 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-900"
            />
          </div>

          {estado.erro && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {estado.erro}
            </p>
          )}

          <button
            type="submit"
            disabled={pendente}
            className="w-full rounded-xl bg-slate-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {pendente ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
