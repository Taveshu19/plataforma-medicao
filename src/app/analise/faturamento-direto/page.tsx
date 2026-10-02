import Link from 'next/link'
import { redirect } from 'next/navigation'
import { obterPerfilUsuario } from '@/lib/aprovacao/dados'
import { contarNaoLidos } from '@/lib/notificacoes/dados'
import { CabecalhoCentral } from '../components/CabecalhoCentral'
import { listarFaturamentosDiretos, TIPOS_FATURAMENTO } from '@/lib/faturamento-direto/dados'
import { SeloStatusFD, dataHora } from '@/components/FaturamentoDireto'
import { formatarReais } from '@/app/formato'

export default async function FaturamentoDiretoEngenhariaPage() {
  const perfil = await obterPerfilUsuario()
  if (!perfil) redirect('/entrar')
  if (!perfil.isConstrutora) redirect('/')

  const [todos, avisosNaoLidos] = await Promise.all([listarFaturamentosDiretos(), contarNaoLidos()])
  const pendentes = todos.filter((f) => f.status === 'AGUARDANDO_ENGENHARIA')
  const demais = todos.filter((f) => f.status !== 'AGUARDANDO_ENGENHARIA')

  return (
    <main className="central-workspace mx-auto w-full px-5 pb-16 pt-6">
        <CabecalhoCentral
          nome={perfil.nome}
          role={perfil.role}
          competencia={null}
          avisosNaoLidos={avisosNaoLidos}
          ativo="faturamento-direto"
          fdPendentes={pendentes.length}
        />
        <p className="text-sm text-slate-500">
          NFs de material e outros faturamentos sem medição. Aprovação só da Engenharia; aprovado, segue direto ao Administrativo.
        </p>

        <section className="mt-6">
          <h2 className="text-sm font-bold text-slate-900">Aguardando Engenharia ({pendentes.length})</h2>
          <Tabela itens={pendentes} vazio="Nenhum faturamento direto aguardando aprovação." />
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold text-slate-900">Já analisados</h2>
          <Tabela itens={demais} vazio="Nada por aqui ainda." />
        </section>
    </main>
  )
}

function Tabela({ itens, vazio }: { itens: Awaited<ReturnType<typeof listarFaturamentosDiretos>>; vazio: string }) {
  if (itens.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {vazio}
      </div>
    )
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-slate-100 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Protocolo</th>
            <th className="px-4 py-3 font-semibold">Empreiteiro</th>
            <th className="px-4 py-3 font-semibold">Tipo / Descrição</th>
            <th className="px-4 py-3 font-semibold">NF</th>
            <th className="px-4 py-3 text-right font-semibold">Valor</th>
            <th className="px-4 py-3 font-semibold">Enviado em</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {itens.map((fd) => (
            <tr key={fd.id}>
              <td className="px-4 py-3 font-mono font-bold text-slate-900">{fd.protocol}</td>
              <td className="px-4 py-3 text-slate-700">{fd.contractorName}<br /><span className="text-slate-400">{fd.projectName}</span></td>
              <td className="max-w-[260px] px-4 py-3 text-slate-700">
                <span className="font-semibold">{TIPOS_FATURAMENTO[fd.billingType] ?? fd.billingType}</span>
                <span className="block truncate text-slate-500">{fd.description}</span>
              </td>
              <td className="px-4 py-3 text-slate-700">{fd.number}</td>
              <td className="px-4 py-3 text-right font-bold text-slate-900">{formatarReais(fd.amount)}</td>
              <td className="px-4 py-3 text-slate-500">{dataHora(fd.submittedAt)}</td>
              <td className="px-4 py-3"><SeloStatusFD status={fd.status} /></td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/analise/faturamento-direto/${fd.id}`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                >
                  {fd.status === 'AGUARDANDO_ENGENHARIA' ? 'Analisar' : 'Ver'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
