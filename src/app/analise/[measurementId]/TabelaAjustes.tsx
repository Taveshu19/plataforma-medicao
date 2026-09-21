'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ItemAnalise } from '@/lib/aprovacao/dados'
import { formatarReais } from '@/app/formato'
import { validateQty, calcSubtotal } from '@/app/medicao/conversao'
import { ajustarQuantidadeAprovada, aprovarMedicao, cancelarMedicao } from '@/app/analise/acoes'
import { ModalDevolucao } from './ModalDevolucao'
import { ModalCancelamento } from './ModalCancelamento'

interface TabelaAjustesProps {
  protocolo?: string | null
  measurementId: string
  itens: ItemAnalise[]
  totalRequested: number
}

export function TabelaAjustes({
  measurementId,
  itens,
  totalRequested,
  protocolo,
}: TabelaAjustesProps) {
  const router = useRouter()
  const [modalDevolver, setModalDevolver] = useState(false)
  const [modalCancelar, setModalCancelar] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Armazena as quantidades aprovadas editadas pelo usuário
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {}
    for (const item of itens) {
      inicial[item.itemId] = item.qtyApproved
    }
    return inicial
  })

  const handleUpdateQty = (itemId: string, valorStr: string) => {
    const parsed = parseFloat(valorStr)
    const val = isNaN(parsed) || parsed < 0 ? 0 : parsed
    setQuantidades((prev) => ({
      ...prev,
      [itemId]: val,
    }))
    setMensagemSucesso(null)
    setErro(null)
  }

  // Verifica se algum item excede o saldo disponível do contrato
  const errosSaldo = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const item of itens) {
      const q = quantidades[item.itemId] ?? item.qtyApproved
      const validacao = validateQty(q, item.contractBalance)
      if (!validacao.valid) {
        mapa[item.itemId] = validacao.error ?? 'Saldo excedido.'
      }
    }
    return mapa
  }, [itens, quantidades])

  const temErroSaldo = Object.keys(errosSaldo).length > 0

  // Total aprovado recalculado ao vivo
  const totalAprovado = useMemo(() => {
    return itens.reduce((sum, item) => {
      const q = quantidades[item.itemId] ?? item.qtyApproved
      return sum + calcSubtotal(q, item.unitPrice)
    }, 0)
  }, [itens, quantidades])

  // Salvar ajustes feitos
  const handleSalvarAjustes = async (): Promise<boolean> => {
    if (temErroSaldo || salvando) return false

    setSalvando(true)
    setErro(null)
    setMensagemSucesso(null)

    for (const item of itens) {
      const novaQty = quantidades[item.itemId]
      if (novaQty !== undefined && novaQty !== item.qtyApproved) {
        const res = await ajustarQuantidadeAprovada(item.itemId, novaQty, measurementId)
        if (!res.success) {
          setErro(res.error ?? 'Erro ao salvar ajustes de quantidade.')
          setSalvando(false)
          return false
        }
      }
    }

    setSalvando(false)
    setMensagemSucesso('Ajustes salvos com sucesso!')
    return true
  }

  const handleCancelar = async (motivo: string) => {
    setCancelando(true)
    setErroCancelar(null)
    const res = await cancelarMedicao(measurementId, motivo)
    setCancelando(false)
    if (!res.success) {
      setErroCancelar(res.error ?? 'Nao foi possivel cancelar a medicao.')
      return
    }
    setModalCancelar(false)
    router.push('/analise')
  }

  // Aprovar medição
  const handleAprovar = async () => {
    if (temErroSaldo || aprovando || salvando) return

    setAprovando(true)
    setErro(null)

    // Se houve alterações, salva primeiro
    const ok = await handleSalvarAjustes()
    if (!ok && itens.some((i) => (quantidades[i.itemId] ?? i.qtyApproved) !== i.qtyApproved)) {
      setAprovando(false)
      return
    }

    const res = await aprovarMedicao(measurementId)
    if (!res.success) {
      setErro(res.error ?? 'Erro ao aprovar a medição.')
      setAprovando(false)
      return
    }

    router.push('/analise')
  }

  return (
    <div className="space-y-6">
      {/* Resumo financeiro consolidado */}
      <section className="grid grid-cols-1 gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Solicitado pelo Empreiteiro
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-700">
            {formatarReais(totalRequested)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Total Aprovado (Recalculado)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-900">
            {formatarReais(totalAprovado)}
          </p>
        </div>
      </section>

      {/* Feedbacks de status */}
      {mensagemSucesso && (
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-800">
            {mensagemSucesso}
          </p>
        </div>
      )}

      {erro && (
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <p role="alert" className="text-sm font-semibold text-rose-700">
            {erro}
          </p>
        </div>
      )}

      {/* Lista detalhada de itens */}
      <section className="space-y-4">
        {itens.map((item) => {
          const qtyAtual = quantidades[item.itemId] ?? item.qtyApproved
          const erroItem = errosSaldo[item.itemId]
          const subtotalItem = calcSubtotal(qtyAtual, item.unitPrice)
          const foiModificado = qtyAtual !== item.qtyRequested

          return (
            <article
              key={item.itemId}
              data-testid={`item-analise-${item.itemId}`}
              className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition ${
                erroItem
                  ? 'ring-rose-400 bg-rose-50/20'
                  : foiModificado
                  ? 'ring-amber-300'
                  : 'ring-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {item.stageName} • {item.unitName}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900">
                    {item.serviceName}
                  </h3>
                  {item.serviceGroup && (
                    <span className="text-xs text-slate-500">
                      {item.serviceGroup}
                    </span>
                  )}
                </div>

                <div className="text-right text-xs">
                  <p className="text-slate-500">Preço unitário</p>
                  <p className="font-semibold text-slate-800">
                    {formatarReais(item.unitPrice)} / {item.unit}
                  </p>
                </div>
              </div>

              {/* Informações de quantidades e limites */}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
                <div>
                  <span className="text-slate-400">Total do local:</span>
                  <p className="font-semibold text-slate-800">
                    {item.unitQuantity} {item.unit}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Saldo contrato:</span>
                  <p className="font-semibold text-emerald-800">
                    {item.contractBalance} {item.unit}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Solicitado:</span>
                  <p className="font-semibold text-slate-800">
                    {item.qtyRequested} {item.unit}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Subtotal Solicitado:</span>
                  <p className="font-semibold text-slate-800">
                    {formatarReais(item.subtotalRequested)}
                  </p>
                </div>
              </div>

              {item.notes && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs italic text-slate-600">
                  Obs. do empreiteiro: {item.notes}
                </p>
              )}

              {/* Edição da Quantidade Aprovada */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`aprovado-${item.itemId}`}
                    className="text-xs font-bold text-slate-700"
                  >
                    Quantidade Aprovada:
                  </label>
                  <div className="relative w-32">
                    <input
                      id={`aprovado-${item.itemId}`}
                      type="number"
                      step="any"
                      min="0"
                      value={qtyAtual}
                      onChange={(e) => handleUpdateQty(item.itemId, e.target.value)}
                      className={`w-full rounded-xl border-0 py-1.5 pl-3 pr-8 text-right text-sm font-bold shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset ${
                        erroItem
                          ? 'text-rose-900 ring-rose-400 focus:ring-rose-600'
                          : 'text-slate-900 ring-slate-300 focus:ring-slate-900'
                      }`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-slate-400">
                      {item.unit}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500">Subtotal Aprovado: </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {formatarReais(subtotalItem)}
                  </span>
                </div>
              </div>

              {erroItem && (
                <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                  {erroItem}
                </p>
              )}
            </article>
          )
        })}
      </section>

      {/* Ações de aprovação, devolução e salvamento */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => setModalCancelar(true)}
            disabled={aprovando || salvando || cancelando}
            className="rounded-xl bg-white px-4 py-3 text-xs font-bold text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar medição
          </button>

          <button
            type="button"
            onClick={() => setModalDevolver(true)}
            disabled={aprovando || salvando}
            className="rounded-xl bg-white px-4 py-3 text-xs font-bold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 disabled:opacity-50"
          >
            Devolver com motivo
          </button>

          <button
            type="button"
            onClick={handleSalvarAjustes}
            disabled={temErroSaldo || salvando || aprovando}
            className="rounded-xl bg-white px-4 py-3 text-xs font-bold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar ajustes'}
          </button>

          <button
            type="button"
            onClick={handleAprovar}
            disabled={temErroSaldo || aprovando || salvando}
            className="rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
          >
            {aprovando ? 'Aprovando medição...' : 'Aprovar medição'}
          </button>
        </div>
      </div>

      <ModalCancelamento
        aberto={modalCancelar}
        protocolo={protocolo ?? null}
        processando={cancelando}
        erro={erroCancelar}
        onFechar={() => {
          setModalCancelar(false)
          setErroCancelar(null)
        }}
        onConfirmar={handleCancelar}
      />

      <ModalDevolucao
        measurementId={measurementId}
        aberto={modalDevolver}
        onFechar={() => setModalDevolver(false)}
      />
    </div>
  )
}
