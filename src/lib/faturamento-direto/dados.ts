import { createServerSupabase } from '@/lib/supabase/server'
import type { StatusFaturamentoDireto } from './rotulos'

export * from './rotulos'

export interface FaturamentoDiretoResumo {
  id: string
  protocol: string
  billingType: string
  number: string
  issuedOn: string
  amount: number
  description: string
  status: StatusFaturamentoDireto
  returnReason: string | null
  contractorName: string
  projectName: string
  contractNumber: string
  pdfPath: string | null
  xmlPath: string | null
  notes: string | null
  submittedAt: string | null
  approvedAt: string | null
  paidAt: string | null
}

export interface EventoFaturamentoDireto {
  action: string
  statusTo: string | null
  reason: string | null
  createdAt: string
  actorName: string
}

export interface FaturamentoDiretoDetalhe extends FaturamentoDiretoResumo {
  companyId: string
  contractId: string
  sentToAdminAt: string | null
  events: EventoFaturamentoDireto[]
}

export async function listarFaturamentosDiretos(
  statuses?: StatusFaturamentoDireto[],
): Promise<FaturamentoDiretoResumo[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc(
    'list_direct_billings',
    statuses ? { p_statuses: statuses } : {},
  )
  if (error || !data) return []

  return data.map((r) => ({
    id: r.id,
    protocol: r.protocol,
    billingType: r.billing_type,
    number: r.number,
    issuedOn: r.issued_on,
    amount: Number(r.amount) || 0,
    description: r.description,
    status: r.status,
    returnReason: r.return_reason,
    contractorName: r.contractor_name,
    projectName: r.project_name,
    contractNumber: r.contract_number,
    pdfPath: r.pdf_path,
    xmlPath: r.xml_path,
    notes: r.notes,
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
  }))
}

export async function obterFaturamentoDireto(id: string): Promise<FaturamentoDiretoDetalhe | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_direct_billing', { p_id: id })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (error || !d || !d.id) return null

  return {
    id: d.id,
    protocol: d.protocol,
    billingType: d.billingType,
    number: d.number,
    issuedOn: d.issuedOn,
    amount: Number(d.amount) || 0,
    description: d.description,
    status: d.status,
    returnReason: d.returnReason,
    contractorName: d.contractorName,
    projectName: d.projectName,
    contractNumber: d.contractNumber,
    pdfPath: d.pdfPath,
    xmlPath: d.xmlPath,
    notes: d.notes,
    submittedAt: d.submittedAt,
    approvedAt: d.approvedAt,
    paidAt: d.paidAt,
    companyId: d.companyId,
    contractId: d.contractId,
    sentToAdminAt: d.sentToAdminAt,
    events: d.events ?? [],
  }
}
