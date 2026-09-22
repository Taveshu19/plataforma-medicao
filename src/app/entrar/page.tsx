'use client'

import { useActionState } from 'react'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { entrar, type EstadoLogin } from './acoes'

const ESTADO_INICIAL: EstadoLogin = {}

export default function Entrar() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL)

  return (
    <main className="login-page">
      <aside className="login-story">
        <Marca clara />
        <div className="blueprint" aria-hidden="true" />
        <div>
          <p className="mb-5 text-xs uppercase tracking-[.2em]">Da obra ao pagamento</p>
          <h2>Seu trabalho<br />ganha forma.<br /><em>E reconhecimento.</em></h2>
          <p className="mt-7">Cada serviço executado, cada etapa aprovada. Sua obra avança e você acompanha.</p>
        </div>
        <div className="login-story-footer"><ShieldCheck size={20} aria-hidden="true" /> Mais clareza em cada medição.<ArrowRight size={18} className="ml-auto" aria-hidden="true" /></div>
      </aside>
      <div className="login-form-panel"><div className="login-form-inner">
        <div className="login-mobile-brand"><Marca /></div>
        <p className="section-eyebrow mb-4">Bem-vindo à sua obra</p>
        <h1>Medição Fácil</h1>
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

          <Button
            type="submit"
            disabled={pendente}
            className="w-full rounded-xl bg-slate-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {pendente ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 text-center">
            Acesso Rápido de Teste (1 clique)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <a
              href="/demo/alfa"
              className="flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors text-center"
            >
              📱 Empreiteiro
            </a>
            <a
              href="/demo/engenharia"
              className="flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors text-center"
            >
              💻 Engenharia
            </a>
            <a
              href="/demo/gerencia"
              className="flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors text-center"
            >
              💼 Gerência
            </a>
          </div>
        </div>

        <p className="login-footer">Seu acesso é fornecido pela construtora.<br />Se precisar de ajuda, fale com a equipe da sua obra.</p>
      </div></div>
    </main>
  )
}
