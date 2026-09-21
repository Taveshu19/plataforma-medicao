import { createServerSupabase } from '@/lib/supabase/server'

export interface DadosMedicaoNF {
  id: string
  protocol: string
  status: string
  companyId: string
  projectName: string
  contractorName: string
  contractNumber: string
  competence: string
  approvedAmount: number
  invoiceTolerance: number
  lastInvoice?: {
    id: string
    number: string
    issuedOn: string
    amount: number
    status: string
    pdfPath: string | null
    xmlPath: string | null
    rejectionReason?: string | null
    createdAt: string
  } | null
}

export interface NotaPendente {
  measurementId: string
  invoiceId: string
  protocol: string
  contractorName: string
  projectName: string
  competence: string
  measurementStatus: string
  invoiceNumber: string
  invoiceIssuedOn: string
  invoiceAmount: number
  approvedAmount: number
  invoiceStatus: string
  pdfPath: string | null
  xmlPath: string | null
  submittedAt: string
}

/**
 * Busca dados da medição para o empreiteiro emitir a Nota Fiscal.
 */
export async function obterDadosMedicaoParaNF(
  measurementId: string,
): Promise<DadosMedicaoNF | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_measurement_invoice_details', {
    p_measurement_id: measurementId,
  })

  if (error || !data || !data.measurement) {
    return null
  }

  const m = data.measurement
  const inv = data.invoice

  return {
    id: m.id,
    protocol: m.protocol,
    status: m.status,
    companyId: m.companyId,
    projectName: m.projectName,
    contractorName: m.contractorName,
    contractNumber: m.contractNumber,
    competence: m.competence,
    approvedAmount: Number(m.approvedAmount) || 0,
    invoiceTolerance: Number(m.invoiceTolerance) || 0,
    lastInvoice: inv
      ? {
          id: inv.id,
          number: inv.number,
          issuedOn: inv.issuedOn,
          amount: Number(inv.amount) || 0,
          status: inv.status,
          pdfPath: inv.pdfPath,
          xmlPath: inv.xmlPath,
          rejectionReason: inv.rejectionReason,
          createdAt: inv.createdAt,
        }
      : null,
  }
}

/**
 * Lista medições com Notas Fiscais pendentes para a construtora (conferência ou pagamento).
 */
export async function listarNotasPendentes(): Promise<NotaPendente[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_pending_invoices')

  if (error || !data) {
    return []
  }

  return data.map((r: any) => ({
    measurementId: r.measurement_id,
    invoiceId: r.invoice_id,
    protocol: r.protocol,
    contractorName: r.contractor_name,
    projectName: r.project_name,
    competence: r.competence,
    measurementStatus: r.measurement_status,
    invoiceNumber: r.invoice_number,
    invoiceIssuedOn: r.invoice_issued_on,
    invoiceAmount: Number(r.invoice_amount) || 0,
    approvedAmount: Number(r.approved_amount) || 0,
    invoiceStatus: r.invoice_status,
    pdfPath: r.pdf_path,
    xmlPath: r.xml_path,
    submittedAt: r.submitted_at,
  }))
}
