'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enviarFaturamentoDiretoAction, uploadArquivoFDAction } from './acoes'

const TIPOS = [
  { valor: 'MATERIAL', rotulo: 'Material' },
  { valor: 'SERVICO_AVULSO', rotulo: 'Serviço avulso' },
  { valor: 'LOCACAO', rotulo: 'Locação de equipamento' },
  { valor: 'OUTRO', rotulo: 'Outro' },
]

interface Props {
  contractId: string
  /** Preenchido quando o empreiteiro corrige um faturamento devolvido. */
  existente?: {
    id: string
    tipo: string
    numero: string
    emitidaEm: string
    valor: number
    descricao: string
    observacao: string | null
    temArquivo: boolean
  }
}

const campo =
  'mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
const arquivoCls =
  'mt-1.5 w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200'

export function FormularioFaturamentoDireto({ contractId, existente }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState(existente?.tipo ?? 'MATERIAL')
  const [numero, setNumero] = useState(existente?.numero ?? '')
  const [emitidaEm, setEmitidaEm] = useState(existente?.emitidaEm ?? new Date().toISOString().split('T')[0])
  const [valor, setValor] = useState(existente ? String(existente.valor) : '')
  const [descricao, setDescricao] = useState(existente?.descricao ?? '')
  const [observacao, setObservacao] = useState(existente?.observacao ?? '')
  const [pdf, setPdf] = useState<File | null>(null)
  const [xml, setXml] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const numValor = parseFloat(valor.replace(',', '.')) || 0

    if (!numero.trim()) return setErro('Informe o número da Nota Fiscal.')
    if (numValor <= 0) return setErro('Informe o valor da Nota Fiscal.')
    if (!descricao.trim()) return setErro('A descrição/justificativa é obrigatória.')
    if (!pdf && !xml && !existente?.temArquivo) return setErro('Anexe a Nota Fiscal (PDF e/ou XML).')

    setEnviando(true)
    try {
      const subir = async (f: File | null) => {
        if (!f) return null
        const fd = new FormData()
        fd.append('file', f)
        const r = await uploadArquivoFDAction(contractId, fd)
        if (r.error) throw new Error(`Falha ao enviar o arquivo ${f.name}: ${r.error}`)
        return r.path ?? null
      }
      const pdfPath = await subir(pdf)
      const xmlPath = await subir(xml)

      const res = await enviarFaturamentoDiretoAction({
        id: existente?.id ?? null,
        contractId,
        tipo,
        numero,
        emitidaEm,
        valor: numValor,
        descricao,
        observacao: observacao || null,
        pdfPath,
        xmlPath,
      })
      if (!res.success || !res.id) {
        setErro(res.error ?? 'Falha ao enviar o faturamento.')
        setEnviando(false)
        return
      }
      router.push(`/faturamento-direto/${res.id}?enviado=1`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado ao enviar.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {erro && (
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p role="alert" className="text-xs font-semibold text-rose-700">{erro}</p>
        </div>
      )}

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <label htmlFor="fd-tipo" className="block text-xs font-semibold text-slate-700">Tipo do faturamento *</label>
          <select id="fd-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fd-numero" className="block text-xs font-semibold text-slate-700">Número da NF *</label>
            <input id="fd-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 001523" className={campo} />
          </div>
          <div>
            <label htmlFor="fd-valor" className="block text-xs font-semibold text-slate-700">Valor (R$) *</label>
            <input id="fd-valor" type="number" step="0.01" min="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={campo} />
          </div>
        </div>

        <div>
          <label htmlFor="fd-data" className="block text-xs font-semibold text-slate-700">Data de emissão *</label>
          <input id="fd-data" type="date" value={emitidaEm} onChange={(e) => setEmitidaEm(e.target.value)} className={campo} />
        </div>

        <div>
          <label htmlFor="fd-descricao" className="block text-xs font-semibold text-slate-700">Descrição / justificativa *</label>
          <textarea
            id="fd-descricao"
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Fornecimento de material hidráulico referente às Casas 01 a 10."
            className={campo}
          />
          <p className="mt-1 text-[11px] text-slate-500">Explique a que esta nota se refere.</p>
        </div>

        <div>
          <label htmlFor="fd-pdf" className="block text-xs font-semibold text-slate-700">PDF da Nota Fiscal</label>
          <input id="fd-pdf" type="file" accept=".pdf,application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className={arquivoCls} />
        </div>
        <div>
          <label htmlFor="fd-xml" className="block text-xs font-semibold text-slate-700">XML da Nota Fiscal</label>
          <input id="fd-xml" type="file" accept=".xml,text/xml,application/xml" onChange={(e) => setXml(e.target.files?.[0] ?? null)} className={arquivoCls} />
          {existente?.temArquivo && (
            <p className="mt-1 text-[11px] text-slate-500">Se não anexar de novo, os arquivos já enviados são mantidos.</p>
          )}
        </div>

        <div>
          <label htmlFor="fd-obs" className="block text-xs font-semibold text-slate-700">Observação (opcional)</label>
          <textarea id="fd-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campo} />
        </div>
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
      >
        {enviando ? 'Enviando...' : existente ? 'Reenviar para a Engenharia' : 'Enviar para a Engenharia'}
      </button>
    </form>
  )
}
