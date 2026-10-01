import { FileText, FileCode2 } from 'lucide-react'
import { ROTULO_EVENTO_FD, ROTULO_STATUS_FD, TIPOS_FATURAMENTO } from '@/lib/faturamento-direto/rotulos'
import type { EventoFaturamentoDireto, FaturamentoDiretoDetalhe } from '@/lib/faturamento-direto/dados'
import { formatarReais } from '@/app/formato'

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export function SeloStatusFD({ status }: { status: string }) {
  const st = ROTULO_STATUS_FD[status] ?? { rotulo: status, cor: 'bg-slate-100 text-slate-700 ring-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${st.cor}`}>
      {st.rotulo}
    </span>
  )
}

export function SeloOrigem({ origem }: { origem: 'MEDICAO' | 'DIRETO' }) {
  return origem === 'MEDICAO' ? (
    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-200">
      Origem: Medição
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-inset ring-orange-200">
      Origem: Faturamento Direto
    </span>
  )
}

export function LinksArquivosNF({ pdfPath, xmlPath }: { pdfPath: string | null; xmlPath: string | null }) {
  if (!pdfPath && !xmlPath) {
    return <p className="text-[11px] text-slate-400">Sem arquivo anexado.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {pdfPath && (
        <a
          href={`/arquivo?path=${encodeURIComponent(pdfPath)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300 hover:ring-slate-400"
        >
          <FileText size={14} aria-hidden="true" /> Ver PDF
        </a>
      )}
      {xmlPath && (
        <a
          href={`/arquivo?path=${encodeURIComponent(xmlPath)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300 hover:ring-slate-400"
        >
          <FileCode2 size={14} aria-hidden="true" /> Ver XML
        </a>
      )}
    </div>
  )
}

export function DadosFaturamentoDireto({ fd }: { fd: FaturamentoDiretoDetalhe }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-base font-bold text-slate-900">{fd.protocol}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {fd.contractorName} • {fd.projectName} • Contrato {fd.contractNumber}
          </p>
        </div>
        <SeloStatusFD status={fd.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
        <div>
          <dt className="text-slate-400">NF nº</dt>
          <dd className="font-semibold text-slate-900">{fd.number}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Valor</dt>
          <dd className="font-bold text-slate-900">{formatarReais(fd.amount)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Tipo</dt>
          <dd className="font-semibold text-slate-900">{TIPOS_FATURAMENTO[fd.billingType] ?? fd.billingType}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Emissão</dt>
          <dd className="font-semibold text-slate-900">
            {new Date(fd.issuedOn + 'T12:00:00').toLocaleDateString('pt-BR')}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-400">Descrição / justificativa</dt>
          <dd className="mt-0.5 whitespace-pre-line font-medium text-slate-900">{fd.description}</dd>
        </div>
        {fd.notes && (
          <div className="col-span-2">
            <dt className="text-slate-400">Observação</dt>
            <dd className="mt-0.5 whitespace-pre-line text-slate-700">{fd.notes}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="mb-1 text-slate-400">Nota Fiscal anexada</dt>
          <dd>
            <LinksArquivosNF pdfPath={fd.pdfPath} xmlPath={fd.xmlPath} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function HistoricoFaturamentoDireto({ eventos }: { eventos: EventoFaturamentoDireto[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-bold text-slate-900">Histórico</h2>
      {eventos.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhum registro ainda.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
          {eventos.map((e, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                  e.action === 'DEVOLVIDO' ? 'bg-rose-500' : e.action === 'PAGO' ? 'bg-blue-500' : 'bg-emerald-500'
                }`}
              />
              <p className="text-xs font-semibold text-slate-900">{ROTULO_EVENTO_FD[e.action] ?? e.action}</p>
              <p className="text-[11px] text-slate-500">
                {dataHora(e.createdAt)} • {e.actorName}
              </p>
              {e.reason && (
                <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-900 ring-1 ring-rose-200">
                  Justificativa: &ldquo;{e.reason}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
