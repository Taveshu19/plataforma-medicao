'use client'

import { useState } from 'react'
import Link from 'next/link'
import { enviarNotaFiscalAction, uploadNotaFiscalPdfAction } from '@/app/faturamento/acoes'

interface FormularioEnvioNFProps {
  measurementId: string
  companyId: string
  valorAprovado: number
  tolerancia: number
  ultimoNumero?: string
  motivoRejeicao?: string | null
}

export function FormularioEnvioNF({
  measurementId,
  companyId,
  valorAprovado,
  tolerancia,
  ultimoNumero,
  motivoRejeicao,
}: FormularioEnvioNFProps) {
  const [numero, setNumero] = useState(ultimoNumero ?? '')
  const [dataEmissao, setDataEmissao] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [valor, setValor] = useState(valorAprovado.toString())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const numValor = parseFloat(valor) || 0
  const diferenca = Math.abs(numValor - valorAprovado)
  const foraDaTolerancia = diferenca > tolerancia

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!numero.trim()) {
      setErro('Por favor, informe o número da Nota Fiscal.')
      return
    }

    if (!dataEmissao) {
      setErro('Por favor, informe a data de emissão.')
      return
    }

    if (numValor <= 0) {
      setErro('O valor da Nota Fiscal deve ser maior que zero.')
      return
    }

    if (foraDaTolerancia) {
      setErro(
        `O valor informado diverge do aprovado além da tolerância permitida de R$ ${tolerancia.toFixed(2)}.`,
      )
      return
    }

    setEnviando(true)

    try {
      let pdfPath: string | null = null

      if (arquivo) {
        const formData = new FormData()
        formData.append('file', arquivo)
        const uploadRes = await uploadNotaFiscalPdfAction(companyId, measurementId, formData)

        if (uploadRes.error) {
          console.error('Erro no upload do PDF:', uploadRes.error)
        } else if (uploadRes.path) {
          pdfPath = uploadRes.path
        }
      }

      const res = await enviarNotaFiscalAction({
        measurementId,
        number: numero.trim(),
        issuedOn: dataEmissao,
        amount: numValor,
        pdfPath,
      })

      if (!res.success) {
        setErro(res.error ?? 'Falha ao enviar nota fiscal.')
        setEnviando(false)
        return
      }

      setSucesso(true)
      setEnviando(false)
    } catch (err: any) {
      setErro(err?.message ?? 'Erro inesperado ao enviar nota fiscal.')
      setEnviando(false)
    }
  }

  if (sucesso) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
          Nota Fiscal enviada com sucesso!
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Sua nota fiscal nº <strong className="text-slate-900">{numero}</strong> foi anexada à medição e enviada para conferência da equipe financeira.
        </p>

        <Link
          href="/medicoes"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          Voltar para Minhas Medições
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {motivoRejeicao && (
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-800">
            Atenção: Nota fiscal anterior recusada
          </p>
          <p className="mt-1 text-xs text-rose-900">
            &ldquo;{motivoRejeicao}&rdquo;
          </p>
        </div>
      )}

      {erro && (
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p role="alert" className="text-xs font-semibold text-rose-700">
            {erro}
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-4">
        <div>
          <label htmlFor="nf-numero" className="block text-xs font-semibold text-slate-700">
            Número da Nota Fiscal *
          </label>
          <input
            id="nf-numero"
            type="text"
            required
            placeholder="Ex: 001420"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div>
          <label htmlFor="nf-data" className="block text-xs font-semibold text-slate-700">
            Data de Emissão *
          </label>
          <input
            id="nf-data"
            type="date"
            required
            value={dataEmissao}
            onChange={(e) => setDataEmissao(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="nf-valor" className="block text-xs font-semibold text-slate-700">
              Valor da Nota (R$) *
            </label>
            {tolerancia > 0 && (
              <span className="text-[11px] text-slate-500">
                Tolerância: ± R$ {tolerancia.toFixed(2)}
              </span>
            )}
          </div>
          <input
            id="nf-valor"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 ${
              foraDaTolerancia
                ? 'border-rose-400 bg-rose-50/20 text-rose-900 focus:border-rose-600 focus:ring-rose-600'
                : 'border-slate-300 focus:border-slate-900 focus:ring-slate-900'
            }`}
          />
          {foraDaTolerancia && (
            <p className="mt-1.5 text-xs font-medium text-rose-600">
              O valor difere de R$ {valorAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em R$ {diferenca.toFixed(2)}, excedendo a tolerância aceita.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="nf-pdf" className="block text-xs font-semibold text-slate-700">
            Anexo do PDF da Nota Fiscal
          </label>
          <input
            id="nf-pdf"
            type="file"
            accept=".pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="mt-1.5 w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
          />
          {arquivo && (
            <p className="mt-1 text-[11px] text-slate-500">
              Arquivo selecionado: {arquivo.name} ({(arquivo.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={enviando || foraDaTolerancia}
        className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
      >
        {enviando ? 'Enviando nota fiscal...' : 'Enviar Nota Fiscal'}
      </button>
    </form>
  )
}
