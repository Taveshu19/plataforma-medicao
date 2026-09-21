'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  anexarFotoAction,
  removerAnexoAction,
  type AnexoMedicao,
} from '@/app/medicao/anexos'

/**
 * Observação e foto de um serviço.
 *
 * É a evidência que sustenta a conferência: sem ela o engenheiro aprova no
 * escuro e a pergunta "por que 20 m²?" não tem resposta. Nasce recolhida
 * porque a maioria dos serviços não precisa, e a tela é de celular.
 */

/** Reduz a foto antes de subir. Câmera de celular gera 8 MB; a obra tem 4G. */
async function comprimir(arquivo: File, larguraMaxima = 1600): Promise<File> {
  if (!arquivo.type.startsWith('image/')) return arquivo

  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, larguraMaxima / bitmap.width)
    if (escala === 1 && arquivo.size < 800_000) return arquivo

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)

    const ctx = canvas.getContext('2d')
    if (!ctx) return arquivo
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    )
    if (!blob || blob.size >= arquivo.size) return arquivo

    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    })
  } catch {
    // Navegador sem createImageBitmap: sobe o original em vez de falhar.
    return arquivo
  }
}

export function EvidenciaServico({
  measurementId,
  contractItemId,
  observacao,
  onChangeObservacao,
  anexos,
  disabled = false,
}: {
  measurementId: string
  contractItemId: string
  observacao: string
  onChangeObservacao: (texto: string) => void
  anexos: AnexoMedicao[]
  disabled?: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(
    () => observacao.length > 0 || anexos.length > 0,
  )
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pendente, startTransition] = useTransition()
  const inputArquivo = useRef<HTMLInputElement>(null)

  const quantidade = anexos.length + (observacao.trim() ? 1 : 0)

  const handleArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setErro(null)
    setEnviando(true)

    const comprimido = await comprimir(arquivo)
    const dados = new FormData()
    dados.set('foto', comprimido)

    const res = await anexarFotoAction(measurementId, contractItemId, dados)
    setEnviando(false)
    if (inputArquivo.current) inputArquivo.current.value = ''

    if (!res.success) {
      setErro(res.error ?? 'Não foi possível enviar a foto.')
      return
    }
    startTransition(() => router.refresh())
  }

  const handleRemover = async (id: string) => {
    setErro(null)
    const res = await removerAnexoAction(id)
    if (!res.success) {
      setErro(res.error ?? 'Não foi possível remover a foto.')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-2.5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        data-testid={`evidencia-${contractItemId}`}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-medium text-slate-500">
          Observação e foto
          {quantidade > 0 && (
            <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {quantidade}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor={`obs-${contractItemId}`}
              className="block text-[11px] font-medium text-slate-600"
            >
              Observação para o engenheiro
            </label>
            <textarea
              id={`obs-${contractItemId}`}
              rows={2}
              disabled={disabled}
              value={observacao}
              onChange={(e) => onChangeObservacao(e.target.value)}
              placeholder="Ex.: executado no bloco da frente"
              className="mt-1 w-full rounded-xl border-0 px-3 py-2 text-sm shadow-xs ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900"
            />
          </div>

          {anexos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {anexos.map((anexo) => (
                <li key={anexo.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={anexo.url}
                    alt="Foto do serviço executado"
                    className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
                  />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemover(anexo.id)}
                      aria-label="Remover foto"
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!disabled && (
            <div>
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleArquivo(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={enviando || pendente}
                onClick={() => inputArquivo.current?.click()}
                className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {enviando ? 'Enviando foto…' : 'Tirar ou escolher foto'}
              </button>
            </div>
          )}

          {erro && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
