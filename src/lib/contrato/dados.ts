import { createServerSupabase } from '@/lib/supabase/server'

export interface ItemContratoVisao {
  itemId: string
  stageName: string
  unitName: string
  serviceName: string
  serviceGroup: string | null
  unit: string
  quantity: number
  unitPrice: number
  totalPrice: number
  balanceQty: number
  measuredQty: number
  balanceAmount: number
}

export interface GrupoContratoEtapa {
  stageName: string
  locais: {
    unitName: string
    itens: ItemContratoVisao[]
  }[]
}

export interface VisaoContrato {
  itens: ItemContratoVisao[]
  etapas: GrupoContratoEtapa[]
  totalContratado: number
  totalMedido: number
  saldoDisponivel: number
}

export async function obterVisaoContrato(contractId: string): Promise<VisaoContrato | null> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('get_contract_items_overview', {
    p_contract_id: contractId,
  })

  if (error || !data) {
    return null
  }

  const itens: ItemContratoVisao[] = data.map((d: any) => ({
    itemId: d.item_id,
    stageName: d.stage_name,
    unitName: d.unit_name,
    serviceName: d.service_name,
    serviceGroup: d.service_group,
    unit: d.unit,
    quantity: Number(d.quantity),
    unitPrice: Number(d.unit_price),
    totalPrice: Number(d.total_price),
    balanceQty: Number(d.balance_qty),
    measuredQty: Number(d.measured_qty),
    balanceAmount: Number(d.balance_amount),
  }))

  const totalContratado = itens.reduce((acc, i) => acc + i.totalPrice, 0)
  const saldoDisponivel = itens.reduce((acc, i) => acc + i.balanceAmount, 0)
  const totalMedido = totalContratado - saldoDisponivel

  // Agrupamento por etapa -> local
  const etapasMap = new Map<string, Map<string, ItemContratoVisao[]>>()

  for (const item of itens) {
    if (!etapasMap.has(item.stageName)) {
      etapasMap.set(item.stageName, new Map())
    }
    const locaisMap = etapasMap.get(item.stageName)!
    if (!locaisMap.has(item.unitName)) {
      locaisMap.set(item.unitName, [])
    }
    locaisMap.get(item.unitName)!.push(item)
  }

  const etapas: GrupoContratoEtapa[] = []
  for (const [stageName, locaisMap] of etapasMap.entries()) {
    const locais = []
    for (const [unitName, itensDoLocal] of locaisMap.entries()) {
      locais.push({ unitName, itens: itensDoLocal })
    }
    etapas.push({ stageName, locais })
  }

  return {
    itens,
    etapas,
    totalContratado,
    totalMedido,
    saldoDisponivel,
  }
}
