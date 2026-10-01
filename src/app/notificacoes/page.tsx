import Link from 'next/link'
import { CalendarDays, Clock3, Inbox, Undo2, Check, X, FileText, Wallet, Bell, type LucideIcon } from 'lucide-react'
import { redirect } from 'next/navigation'
import { listarAvisos, contarNaoLidos } from '@/lib/notificacoes/dados'
import { createServerSupabase } from '@/lib/supabase/server'
import { BotaoMarcarLidos } from './BotaoMarcarLidos'

const ICONE: Record<string, { cor: string; icon: LucideIcon }> = {
  PERIODO_ABERTO: { cor: 'bg-emerald-100 text-emerald-700', icon: CalendarDays },
  PRAZO_PROXIMO: { cor: 'bg-amber-100 text-amber-700', icon: Clock3 },
  MEDICAO_RECEBIDA: { cor: 'bg-slate-200 text-slate-700', icon: Inbox },
  MEDICAO_DEVOLVIDA: { cor: 'bg-rose-100 text-rose-700', icon: Undo2 },
  MEDICAO_APROVADA: { cor: 'bg-emerald-100 text-emerald-700', icon: Check },
  MEDICAO_CANCELADA: { cor: 'bg-slate-200 text-slate-600', icon: X },
  NF_RECEBIDA: { cor: 'bg-slate-200 text-slate-700', icon: FileText },
  NF_APROVADA: { cor: 'bg-emerald-100 text-emerald-700', icon: Check },
  PAGAMENTO: { cor: 'bg-emerald-100 text-emerald-700', icon: Wallet },
  FD_RECEBIDO: { cor: 'bg-slate-200 text-slate-700', icon: FileText },
  FD_APROVADO: { cor: 'bg-emerald-100 text-emerald-700', icon: Check },
  FD_DEVOLVIDO: { cor: 'bg-rose-100 text-rose-700', icon: Undo2 },
}

function quando(iso: string): string {
  const d = new Date(iso)
  const minutos = Math.floor((Date.now() - d.getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  if (minutos < 1440) return `há ${Math.floor(minutos / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function NotificacoesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const [avisos, naoLidos] = await Promise.all([listarAvisos(), contarNaoLidos()])

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Avisos</h1>
            <p className="mt-1 text-xs text-slate-500">
              {naoLidos > 0 ? `${naoLidos} não ${naoLidos === 1 ? 'lido' : 'lidos'}` : 'Tudo em dia'}
            </p>
          </div>
          <BotaoMarcarLidos naoLidos={naoLidos} />
        </div>
      </header>

      {avisos.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-600">Nenhum aviso por enquanto.</p>
          <p className="mt-1 text-xs text-slate-500">
            Você será avisado quando a medição abrir, for devolvida, aprovada ou paga.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {avisos.map((aviso) => {
            const icone = ICONE[aviso.kind] ?? { cor: 'bg-slate-200 text-slate-700', icon: Bell }
            const Icone = icone.icon
            const naoLido = aviso.readAt === null
            const conteudo = (
              <div
                className={`flex gap-3 rounded-2xl p-4 shadow-sm ring-1 transition ${
                  naoLido ? 'bg-white ring-slate-300' : 'bg-white/60 ring-slate-200'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${icone.cor}`}
                >
                  <Icone size={18} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className={`text-sm ${
                        naoLido ? 'font-semibold text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      {aviso.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {quando(aviso.createdAt)}
                    </span>
                  </div>
                  {aviso.body && (
                    <p className="mt-0.5 text-xs text-slate-600">{aviso.body}</p>
                  )}
                </div>
                {naoLido && (
                  <span aria-label="não lido" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-900" />
                )}
              </div>
            )

            return (
              <li key={aviso.id}>
                {aviso.link ? (
                  <Link href={aviso.link} className="block">
                    {conteudo}
                  </Link>
                ) : (
                  conteudo
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
