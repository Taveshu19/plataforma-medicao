'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ServicoLocal } from '@/lib/medicao/dados'
import { LinhaServico } from './LinhaServico'
import { validateQty, calcSubtotal } from '@/app/medicao/conversao'
import { formatarReais } from '@/app/formato'
import { salvarMedicaoLocal } from '@/app/medicao/acoes'

interface FormLocalProps {
  measurementId: string
  unitId: string
  unitName: string
  stageName: string
  servicos: ServicoLocal[]
}

export function FormLocal({
  measurementId,
  unitName,
  stageName,
  servicos,
}: FormLocalProps) {
  const router = useRouter()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {}
    for (const s of servicos) {
      inicial[s.contractItemId] = s.measuredQty
    }
    return inicial
  })

  const handleUpdateQty = (contractItemId: string, novaQty: number) => {
    setQuantidades((prev) => ({
      ...prev,
      [contractItemId]: novaQty,
    }))
    setErro(null)
  }

  const temErroSaldo = servicos.some((s) => {
    const q = quantidades[s.contractItemId] ?? 0
    return !validateQty(q, s.balance).valid
  })

  const totalLocal = servicos.reduce((acc, s) => {
    const q = quantidades[s.contractItemId] ?? 0
    return acc + calcSubtotal(q, s.unitPrice)
  }, 0)

  const totalItensMedidos = servicos.filter(
    (s) => (quantidades[s.contractItemId] ?? 0) > 0,
  ).length

  const handleSalvar = async () => {
    if (temErroSaldo || salvando) return

    setSalvando(true)
    setErro(null)

    const itens = servicos.map((s) => ({
      contractItemId: s.contractItemId,
      qtyRequested: quantidades[s.contractItemId] ?? 0,
    }))

    const resultado = await salvarMedicaoLocal(measurementId, itens)

    if (!resultado.success) {
      setErro(resultado.error ?? 'Ocorreu um erro ao salvar a medição.')
      setSalvando(false)
      return
    }

    router.push('/medicao')
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/medicao"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para os locais
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {stageName}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {unitName}
        </h1>
      </header>

      {erro && (
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p role="alert" className="text-sm font-semibold text-rose-700">
            {erro}
          </p>
        </div>
      )}

      {/* Lista de serviços */}
      <div className="space-y-3">
        {servicos.map((servico) => (
          <LinhaServico
            key={servico.contractItemId}
            servico={servico}
            qty={quantidades[servico.contractItemId] ?? 0}
            onChangeQty={(novaQty) => handleUpdateQty(servico.contractItemId, novaQty)}
            disabled={salvando}
          />
        ))}
      </div>

      {/* Barra de ação inferior fixa */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-md">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Total medido no local ({totalItensMedidos} de {servicos.length} serviços)
            </span>
            <span className="text-sm font-bold text-slate-900">
              {formatarReais(totalLocal)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || temErroSaldo}
            className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-40"
          >
            {salvando
              ? 'Salvando...'
              : temErroSaldo
              ? 'Corrija os valores com saldo excedido'
              : 'Salvar e voltar aos locais'}
          </button>
        </div>
      </div>
    </div>
  )
}
