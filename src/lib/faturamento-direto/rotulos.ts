import type { Database } from '@/types/database.types'

export type StatusFaturamentoDireto = Database['public']['Enums']['direct_billing_status']

export const TIPOS_FATURAMENTO: Record<string, string> = {
  MATERIAL: 'Material',
  SERVICO_AVULSO: 'Serviço avulso',
  LOCACAO: 'Locação de equipamento',
  OUTRO: 'Outro',
}

export const ROTULO_STATUS_FD: Record<string, { rotulo: string; cor: string }> = {
  RASCUNHO: { rotulo: 'Rascunho', cor: 'bg-slate-100 text-slate-700 ring-slate-200' },
  ENVIADO: { rotulo: 'Enviado', cor: 'bg-slate-100 text-slate-700 ring-slate-200' },
  AGUARDANDO_ENGENHARIA: { rotulo: 'Aguardando Engenharia', cor: 'bg-amber-50 text-amber-800 ring-amber-200' },
  DEVOLVIDO: { rotulo: 'Devolvido para correção', cor: 'bg-rose-50 text-rose-800 ring-rose-200' },
  APROVADO: { rotulo: 'Aprovado • no Administrativo', cor: 'bg-teal-50 text-teal-800 ring-teal-200' },
  PAGO: { rotulo: 'Pago', cor: 'bg-blue-50 text-blue-800 ring-blue-200' },
}

export const ROTULO_EVENTO_FD: Record<string, string> = {
  ENVIADO: 'NF enviada pelo empreiteiro',
  REENVIADO: 'NF corrigida e reenviada pelo empreiteiro',
  DEVOLVIDO: 'Devolvida para correção pela Engenharia',
  APROVADO_ENGENHARIA: 'Aprovada pela Engenharia',
  ENVIADO_ADMINISTRATIVO: 'Encaminhada ao Administrativo/Faturamento',
  PAGO: 'Pagamento registrado pelo Administrativo',
}

