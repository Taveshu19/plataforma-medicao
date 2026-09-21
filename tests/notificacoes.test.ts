import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup, createUser, type TestUser } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let empreiteiro: TestUser
let engenheiro: TestUser
let financeiro: TestUser

interface Notificacao {
  kind: string
  title: string
  body: string
  user_id: string
  read_at: string | null
}

async function notificacoesDe(userId: string): Promise<Notificacao[]> {
  return sql<Notificacao>(
    'select kind, title, body, user_id, read_at from notifications where user_id = $1 order by created_at',
    [userId],
  )
}

async function mudarStatus(id: string, status: string) {
  await sql(`update measurements set status = $2::measurement_status where id = $1`, [id, status])
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()

  engenheiro = await createUser('eng.notif@vista.test', s.companyId, 'engenharia')
  financeiro = await createUser('fin.notif@vista.test', s.companyId, 'financeiro')
  empreiteiro = await createUser('alfa.notif@alfa.test', s.companyId, 'empreiteiro')
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    s.contractorId,
    empreiteiro.userId,
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('avisos gerados por evento da medição', () => {
  it('quando a medição é enviada, a construtora é avisada e o empreiteiro não', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await mudarStatus(id, 'EM_ANALISE')

    const doEngenheiro = await notificacoesDe(engenheiro.userId)
    expect(doEngenheiro.map((n) => n.kind)).toContain('MEDICAO_RECEBIDA')
    expect(await notificacoesDe(empreiteiro.userId)).toHaveLength(0)
  })

  it('quando é devolvida, o empreiteiro é avisado', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await mudarStatus(id, 'DEVOLVIDA')

    const avisos = await notificacoesDe(empreiteiro.userId)
    expect(avisos.map((n) => n.kind)).toContain('MEDICAO_DEVOLVIDA')
    expect(avisos[0].title).toMatch(/devolvida/i)
  })

  it('quando é aprovada, o empreiteiro é avisado que pode faturar', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await mudarStatus(id, 'APROVADA')

    const avisos = await notificacoesDe(empreiteiro.userId)
    expect(avisos.map((n) => n.kind)).toContain('MEDICAO_APROVADA')
    expect(avisos.find((n) => n.kind === 'MEDICAO_APROVADA')!.body).toMatch(/faturamento/i)
  })

  it('a nota fiscal avisa o financeiro, não a engenharia', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await mudarStatus(id, 'NF_ENVIADA')

    expect((await notificacoesDe(financeiro.userId)).map((n) => n.kind)).toContain('NF_RECEBIDA')
    expect((await notificacoesDe(engenheiro.userId)).map((n) => n.kind)).not.toContain(
      'NF_RECEBIDA',
    )
  })

  it('o pagamento avisa o empreiteiro', async () => {
    const id = await createMeasurement(s, 'NF_APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await mudarStatus(id, 'PAGA')

    expect((await notificacoesDe(empreiteiro.userId)).map((n) => n.kind)).toContain('PAGAMENTO')
  })

  it('o cancelamento avisa o empreiteiro', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql('select cancel_measurement($1, $2)', [id, 'Lancamento em duplicidade.'])

    expect((await notificacoesDe(empreiteiro.userId)).map((n) => n.kind)).toContain(
      'MEDICAO_CANCELADA',
    )
  })

  it('mudança que não altera o status não gera aviso', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const antes = (await notificacoesDe(engenheiro.userId)).length
    await sql('update measurements set current_level = 2 where id = $1', [id])
    expect((await notificacoesDe(engenheiro.userId)).length).toBe(antes)
  })

  it('o aviso carrega o protocolo, para o destinatário saber de qual medição se trata', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql('select submit_measurement($1)', [id])

    const aviso = (await notificacoesDe(engenheiro.userId)).find(
      (n) => n.kind === 'MEDICAO_RECEBIDA',
    )!
    expect(aviso.body).toMatch(/MED-\d{4}-\d{2}-\d{3}/)
  })
})

describe('avisos que dependem de tempo', () => {
  it('a abertura do período avisa os empreiteiros da obra', async () => {
    const [linha] = await sql<{ total: number }>(
      'select notify_period_opened($1) as total',
      [s.periodId],
    )
    expect(linha.total).toBeGreaterThan(0)

    const avisos = await notificacoesDe(empreiteiro.userId)
    expect(avisos.map((n) => n.kind)).toContain('PERIODO_ABERTO')
  })

  it('chamar duas vezes não duplica o aviso de abertura', async () => {
    await sql('select notify_period_opened($1)', [s.periodId])
    const depoisDaPrimeira = (await notificacoesDe(empreiteiro.userId)).length
    await sql('select notify_period_opened($1)', [s.periodId])
    expect((await notificacoesDe(empreiteiro.userId)).length).toBe(depoisDaPrimeira)
  })

  it('o aviso de prazo vai só para quem ainda não enviou', async () => {
    const [antes] = await sql<{ total: number }>(
      'select notify_deadline_approaching($1) as total',
      [s.periodId],
    )
    expect(antes.total).toBeGreaterThan(0)

    // Agora ele envia; o proximo aviso nao deve alcanca-lo.
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(id).toBeTruthy()

    const [depois] = await sql<{ total: number }>(
      'select notify_deadline_approaching($1) as total',
      [s.periodId],
    )
    expect(depois.total).toBe(0)
  })

  it('rascunho não conta como enviado para o aviso de prazo', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const [linha] = await sql<{ total: number }>(
      'select notify_deadline_approaching($1) as total',
      [s.periodId],
    )
    expect(linha.total).toBeGreaterThan(0)
  })

  it('período encerrado não gera aviso de prazo', async () => {
    await sql(
      `update measurement_periods set closes_at = now() - interval '1 day' where id = $1`,
      [s.periodId],
    )
    const [linha] = await sql<{ total: number }>(
      'select notify_deadline_approaching($1) as total',
      [s.periodId],
    )
    expect(linha.total).toBe(0)
  })
})

describe('leitura e isolamento', () => {
  it('cada um enxerga apenas as próprias notificações', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await mudarStatus(id, 'APROVADA')

    const { data: doEmpreiteiro } = await empreiteiro.client
      .from('notifications')
      .select('user_id')
    expect(doEmpreiteiro!.length).toBeGreaterThan(0)
    expect(doEmpreiteiro!.every((n) => n.user_id === empreiteiro.userId)).toBe(true)

    const { data: doEngenheiro } = await engenheiro.client
      .from('notifications')
      .select('kind')
    expect(doEngenheiro!.map((n) => n.kind)).not.toContain('MEDICAO_APROVADA')
  })

  it('marcar como lida afeta só as próprias', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await mudarStatus(id, 'EM_ANALISE')
    await mudarStatus(id, 'APROVADA')

    const { data: total } = await empreiteiro.client.rpc('mark_notifications_read')
    expect(Number(total)).toBeGreaterThan(0)

    const doEmpreiteiro = await notificacoesDe(empreiteiro.userId)
    expect(doEmpreiteiro.every((n) => n.read_at !== null)).toBe(true)

    // As do engenheiro seguem nao lidas.
    const doEngenheiro = await notificacoesDe(engenheiro.userId)
    expect(doEngenheiro.some((n) => n.read_at === null)).toBe(true)
  })
})
