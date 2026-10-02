/**
 * Monta a trilha de status da medição para a tela inicial do empreiteiro.
 *
 * Os passos de aprovação nascem de `approval_levels`, que é configurável por
 * obra. Foi pedido assim de propósito: o cliente citou um nível "estagiário"
 * que não existe nesta obra, mostrando que espera cadeias variáveis.
 * Acrescentar um nível é inserir uma linha no banco, não mexer nesta tela.
 */

export type EstadoPasso = 'concluido' | 'atual' | 'pendente' | 'devolvido'

export interface PassoTrilha {
  rotulo: string
  estado: EstadoPasso
  detalhe?: string
}

export interface NivelAprovacao {
  level: number
  label: string
}

export interface ProgressoMedicao {
  status: string
  currentLevel: number
  protocolo: string | null
  dataPrevistaPagamento: string | null
}

/** Status em que a medição já passou por toda a cadeia de aprovação. */
const APOS_APROVACAO = ['APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA']

function formatarData(iso: string): string {
  const d = new Date(iso)
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/')
}

export function montarTrilha(
  progresso: ProgressoMedicao | null,
  niveis: NivelAprovacao[],
): PassoTrilha[] {
  const ordenados = [...niveis].sort((a, b) => a.level - b.level)

  if (!progresso) {
    return [
      { rotulo: 'Criar medição', estado: 'atual' },
      ...ordenados.map((n) => ({ rotulo: n.label, estado: 'pendente' as const })),
      { rotulo: 'Faturamento liberado', estado: 'pendente' },
      { rotulo: 'Nota fiscal', estado: 'pendente' },
      { rotulo: 'Pagamento', estado: 'pendente' },
    ]
  }

  const { status, currentLevel, dataPrevistaPagamento } = progresso
  const passouAprovacao = APOS_APROVACAO.includes(status)
  const devolvida = status === 'DEVOLVIDA'

  const envio: PassoTrilha = devolvida
    ? {
        rotulo: 'Devolvida para correção',
        estado: 'devolvido',
        detalhe: 'Corrija e envie novamente.',
      }
    : status === 'RASCUNHO'
    ? { rotulo: 'Enviar medição', estado: 'atual' }
    : { rotulo: 'Medição enviada', estado: 'concluido' }

  const aprovacoes: PassoTrilha[] = ordenados.map((n) => {
    if (devolvida || status === 'RASCUNHO') {
      return { rotulo: n.label, estado: 'pendente' }
    }
    if (passouAprovacao) {
      return { rotulo: n.label, estado: 'concluido' }
    }
    // EM_ANALISE
    if (n.level < currentLevel) return { rotulo: n.label, estado: 'concluido' }
    if (n.level === currentLevel) return { rotulo: n.label, estado: 'atual' }
    return { rotulo: n.label, estado: 'pendente' }
  })

  // Aprovada pela cadeia toda = faturamento já liberado (bolinha verde).
  // A partir daí a etapa atual é a nota fiscal do empreiteiro.
  const liberado: PassoTrilha = {
    rotulo: 'Faturamento liberado',
    estado: passouAprovacao ? 'concluido' : 'pendente',
  }

  const notaFiscal: PassoTrilha = {
    rotulo: 'Nota fiscal',
    estado:
      status === 'APROVADA' || status === 'NF_ENVIADA'
        ? 'atual'
        : ['NF_APROVADA', 'PAGA'].includes(status)
        ? 'concluido'
        : 'pendente',
    detalhe:
      status === 'APROVADA'
        ? 'Envie a nota fiscal desta medição.'
        : status === 'NF_ENVIADA'
        ? 'Enviada • em conferência no Administrativo.'
        : undefined,
  }

  const pagamento: PassoTrilha = {
    rotulo: 'Pagamento',
    estado: status === 'PAGA' ? 'concluido' : status === 'NF_APROVADA' ? 'atual' : 'pendente',
    detalhe:
      status !== 'PAGA' && dataPrevistaPagamento
        ? `Previsto para ${formatarData(dataPrevistaPagamento)}`
        : undefined,
  }

  return [envio, ...aprovacoes, liberado, notaFiscal, pagamento]
}
