'use client'

import { useState } from 'react'
import { ServicoLocal } from '@/lib/medicao/dados'
import {
  qtyFromPercent,
  percentFromQty,
  validateQty,
  calcSubtotal,
} from '@/app/medicao/conversao'
import { formatarReais } from '@/app/formato'
import { EvidenciaServico } from './EvidenciaServico'
import type { AnexoMedicao } from '@/app/medicao/anexos'

interface LinhaServicoProps {
  servico: ServicoLocal
  qty: number
  onChangeQty: (novaQty: number) => void
  measurementId: string
  observacao: string
  onChangeObservacao: (texto: string) => void
  anexos: AnexoMedicao[]
  disabled?: boolean
}

export function LinhaServico({
  servico,
  qty,
  onChangeQty,
  measurementId,
  observacao,
  onChangeObservacao,
  anexos,
  disabled = false,
}: LinhaServicoProps) {
  const [modo, setModo] = useState<'qty' | 'percent'>('qty')
  const [percentTexto, setPercentTexto] = useState<string>(() => {
    return qty > 0 ? String(percentFromQty(servico.quantity, qty)) : ''
  })
  const [qtyTexto, setQtyTexto] = useState<string>(() => {
    return qty > 0 ? String(qty) : ''
  })

  const validacao = validateQty(qty, servico.balance)
  const subtotal = calcSubtotal(qty, servico.unitPrice)

  const alternarModo = (novoModo: 'qty' | 'percent') => {
    if (novoModo === modo) return
    setModo(novoModo)
    if (novoModo === 'percent') {
      const p = percentFromQty(servico.quantity, qty)
      setPercentTexto(p > 0 ? String(p) : '')
    } else {
      setQtyTexto(qty > 0 ? String(qty) : '')
    }
  }

  const handleQtyChange = (valorStr: string) => {
    setQtyTexto(valorStr)
    const parsed = parseFloat(valorStr)
    const novaQty = isNaN(parsed) || parsed < 0 ? 0 : parsed
    onChangeQty(novaQty)
    const p = percentFromQty(servico.quantity, novaQty)
    setPercentTexto(p > 0 ? String(p) : '')
  }

  const handlePercentChange = (valorStr: string) => {
    setPercentTexto(valorStr)
    const parsed = parseFloat(valorStr)
    const percent = isNaN(parsed) || parsed < 0 ? 0 : parsed
    const novaQty = qtyFromPercent(servico.quantity, percent)
    onChangeQty(novaQty)
    setQtyTexto(novaQty > 0 ? String(novaQty) : '')
  }

  return (
    <article
      data-testid={`linha-servico-${servico.contractItemId}`}
      className={`service-card rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${
        !validacao.valid
          ? 'ring-rose-400 bg-rose-50/20'
          : qty > 0
          ? 'ring-slate-300'
          : 'ring-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {servico.serviceGroup && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {servico.serviceGroup}
            </p>
          )}
          <h3 className="text-base font-semibold text-slate-900">
            {servico.serviceName}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Preço unitário</p>
          <p className="text-xs font-semibold text-slate-700">
            {formatarReais(servico.unitPrice)} / {servico.unit}
          </p>
        </div>
      </div>

      {/* Referências de quantidade e saldo */}
      <div className="quantity-reference text-xs text-slate-600">
        <div>
          <span className="text-slate-500">Total no local: </span>
          <span className="font-semibold text-slate-800">
            {servico.quantity} {servico.unit}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Saldo disponível: </span>
          <span className="font-semibold text-emerald-800">
            {servico.balance} {servico.unit}
          </span>
        </div>
      </div>

      {/* Seletor de modo e campo de entrada */}
      <div className="quantity-entry flex items-center justify-between gap-3">
        {/* Toggle Metragem / % */}
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => alternarModo('qty')}
            aria-pressed={modo === 'qty'}
            className={`rounded-md px-2.5 py-1.5 transition ${
              modo === 'qty'
                ? 'bg-white font-semibold text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {servico.unit}
          </button>
          <button
            type="button"
            onClick={() => alternarModo('percent')}
            aria-pressed={modo === 'percent'}
            className={`rounded-md px-2.5 py-1.5 transition ${
              modo === 'percent'
                ? 'bg-white font-semibold text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            %
          </button>
        </div>

        {/* Input numérico */}
        <div className="relative w-36">
          {modo === 'qty' ? (
            <div className="relative">
              <input
                aria-label={`${servico.serviceName} — ${servico.unit}`}
                aria-invalid={!validacao.valid}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                disabled={disabled}
                value={qtyTexto}
                onChange={(e) => handleQtyChange(e.target.value)}
                placeholder="0"
                className={`w-full rounded-xl border-0 py-2 pl-3 pr-9 text-right text-base font-bold shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset ${
                  !validacao.valid
                    ? 'text-rose-900 ring-rose-400 focus:ring-rose-600'
                    : 'text-slate-900 ring-slate-300 focus:ring-slate-900'
                }`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                {servico.unit}
              </span>
            </div>
          ) : (
            <div className="relative">
              <input
                aria-label={`${servico.serviceName} — percentual`}
                aria-invalid={!validacao.valid}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                max="100"
                disabled={disabled}
                value={percentTexto}
                onChange={(e) => handlePercentChange(e.target.value)}
                placeholder="0"
                className={`w-full rounded-xl border-0 py-2 pl-3 pr-7 text-right text-base font-bold shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset ${
                  !validacao.valid
                    ? 'text-rose-900 ring-rose-400 focus:ring-rose-600'
                    : 'text-slate-900 ring-slate-300 focus:ring-slate-900'
                }`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                %
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mensagem de erro de saldo */}
      {!validacao.valid && (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
          {validacao.error}
        </p>
      )}

      {/* Subtotal da linha */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
        <span className="text-slate-500">
          {modo === 'percent' && qty > 0 ? (
            <span>Equivale a {qty.toLocaleString('pt-BR')} {servico.unit}</span>
          ) : (
            <span>Subtotal</span>
          )}
        </span>
        <span className="text-sm font-bold text-slate-900">
          {formatarReais(subtotal)}
        </span>
      </div>

      <EvidenciaServico
        measurementId={measurementId}
        contractItemId={servico.contractItemId}
        observacao={observacao}
        onChangeObservacao={onChangeObservacao}
        anexos={anexos}
        disabled={disabled}
      />
    </article>
  )
}
