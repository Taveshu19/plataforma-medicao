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

export interface ResumoServico {
  serviceName: string
  serviceGroup: string | null
  unit: string
  totalQuantity: number
  measuredQuantity: number
  balanceQuantity: number
  totalAmount: number
  measuredAmount: number
  balanceAmount: number
  locations: number
}

/**
 * Total de cada serviço somando todos os locais do contrato.
 * Pedido pelo cliente: "quantos m² ele tem total do serviço de contrapiso
 * juntando todas as casas". Agrupa por serviço E unidade, porque somar
 * "Contrapiso em m²" com "Contrapiso em verba" daria um número sem sentido.
 */
export async function obterResumoPorServico(contractId: string): Promise<ResumoServico[]> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('get_contract_services_summary', {
    p_contract_id: contractId,
  })

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map((r) => ({
    serviceName: String(r.service_name),
    serviceGroup: (r.service_group as string | null) ?? null,
    unit: String(r.unit),
    totalQuantity: Number(r.total_quantity),
    measuredQuantity: Number(r.measured_quantity),
    balanceQuantity: Number(r.balance_quantity),
    totalAmount: Number(r.total_amount),
    measuredAmount: Number(r.measured_amount),
    balanceAmount: Number(r.balance_amount),
    locations: Number(r.locations),
  }))
}
