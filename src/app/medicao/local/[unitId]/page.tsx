import { redirect } from 'next/navigation'
import { carregarContexto } from '@/app/contexto'
import {
  obterOuCriarRascunho,
  listarLocaisMedicao,
  listarServicosLocal,
} from '@/lib/medicao/dados'
import { FormLocal } from './FormLocal'

interface PageProps {
  params: Promise<{
    unitId: string
  }>
}

export default async function LocalMedicaoPage({ params }: PageProps) {
  const { unitId } = await params

  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  if (!contexto.periodo) redirect('/medicao')

  const rascunho = await obterOuCriarRascunho(contexto.contratoId)
  if (!rascunho) redirect('/medicao')

  const locais = await listarLocaisMedicao(rascunho.id)
  const localInfo = locais.find((l) => l.unitId === unitId)
  if (!localInfo) redirect('/medicao')

  const servicos = await listarServicosLocal(rascunho.id, unitId)

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
      <FormLocal
        measurementId={rascunho.id}
        unitId={unitId}
        unitName={localInfo.unitName}
        stageName={localInfo.stageName}
        servicos={servicos}
      />
    </main>
  )
}
