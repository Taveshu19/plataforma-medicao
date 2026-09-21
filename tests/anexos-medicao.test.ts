import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let medicao: string

async function anexar(contractItemId: string | null, caminho: string): Promise<string> {
  const [linha] = await sql<{ id: string }>(
    `select attach_measurement_file($1, $2, 'medicao-fotos', $3, 'image/jpeg', 120000) as id`,
    [medicao, contractItemId, caminho],
  )
  return linha.id
}

async function listar(contractItemId: string | null = null) {
  return sql<{ id: string; contract_item_id: string | null; path: string }>(
    'select * from get_measurement_files($1, $2)',
    [medicao, contractItemId],
  )
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  medicao = await createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('anexos de medição', () => {
  it('anexa uma foto a um serviço do rascunho', async () => {
    const id = await anexar(s.contrapisoId, `${s.companyId}/medicoes/foto1.jpg`)
    expect(id).toBeTruthy()

    const anexos = await listar()
    expect(anexos).toHaveLength(1)
    expect(anexos[0].contract_item_id).toBe(s.contrapisoId)
  })

  it('filtra os anexos por serviço', async () => {
    await anexar(s.contrapisoId, `${s.companyId}/medicoes/contrapiso.jpg`)
    await anexar(s.alvenariaId, `${s.companyId}/medicoes/alvenaria.jpg`)

    expect(await listar()).toHaveLength(2)
    expect(await listar(s.contrapisoId)).toHaveLength(1)
    expect((await listar(s.alvenariaId))[0].path).toContain('alvenaria')
  })

  it('aceita anexo sem serviço, para a medição inteira', async () => {
    const id = await anexar(null, `${s.companyId}/medicoes/geral.pdf`)
    expect(id).toBeTruthy()
    expect((await listar())[0].contract_item_id).toBeNull()
  })

  it('recusa anexo de item que não pertence ao contrato da medição', async () => {
    const [outroContratado] = await sql<{ id: string }>(
      `insert into contractors (company_id, name) values ($1, 'Outra Empreiteira') returning id`,
      [s.companyId],
    )
    const [outroContrato] = await sql<{ id: string }>(
      `insert into contracts (company_id, project_id, contractor_id, number)
       values ($1, $2, $3, '099/2026') returning id`,
      [s.companyId, s.projectId, outroContratado.id],
    )
    const [itemAlheio] = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Fachada', 'm2', 100, 50) returning id`,
      [s.companyId, outroContrato.id],
    )

    await expect(anexar(itemAlheio.id, 'x/y.jpg')).rejects.toThrow(/nao pertence ao contrato/i)
  })

  it('recusa anexo depois que a medição foi enviada', async () => {
    await sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [medicao])
    await expect(anexar(s.contrapisoId, 'x/y.jpg')).rejects.toThrow(/nao aceita mais anexos/i)
  })

  it('aceita anexo em medição devolvida, que voltou para correção', async () => {
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [medicao])
    const id = await anexar(s.contrapisoId, `${s.companyId}/medicoes/correcao.jpg`)
    expect(id).toBeTruthy()
  })

  it('remove um anexo do rascunho', async () => {
    const id = await anexar(s.contrapisoId, `${s.companyId}/medicoes/foto.jpg`)
    await sql('select remove_measurement_file($1)', [id])
    expect(await listar()).toHaveLength(0)
  })

  it('recusa remover anexo de medição já enviada', async () => {
    const id = await anexar(s.contrapisoId, `${s.companyId}/medicoes/foto.jpg`)
    await sql(`update measurements set status = 'EM_ANALISE' where id = $1`, [medicao])
    await expect(sql('select remove_measurement_file($1)', [id])).rejects.toThrow(
      /nao permite remover/i,
    )
  })

  it('registra o anexo e a remoção na auditoria', async () => {
    const id = await anexar(s.contrapisoId, `${s.companyId}/medicoes/foto.jpg`)
    await sql('select remove_measurement_file($1)', [id])

    const acoes = await sql<{ action: string }>(
      `select action from audit_log where measurement_id = $1
       and action in ('ANEXO_ADICIONADO', 'ANEXO_REMOVIDO') order by created_at`,
      [medicao],
    )
    expect(acoes.map((a) => a.action)).toEqual(['ANEXO_ADICIONADO', 'ANEXO_REMOVIDO'])
  })

  it('apagar o item de contrato leva os anexos dele junto', async () => {
    await anexar(s.contrapisoId, `${s.companyId}/medicoes/foto.jpg`)
    await sql('delete from measurement_items where contract_item_id = $1', [s.contrapisoId])
    await sql('delete from contract_items where id = $1', [s.contrapisoId])
    expect(await listar()).toHaveLength(0)
  })
})

describe('observação por serviço', () => {
  it('a observação digitada pelo empreiteiro é gravada no item', async () => {
    await sql('select save_measurement_items($1, $2::jsonb)', [
      medicao,
      JSON.stringify([
        {
          contract_item_id: s.contrapisoId,
          qty_requested: 20,
          notes: 'Executado no bloco da frente, conforme foto.',
        },
      ]),
    ])

    const [item] = await sql<{ notes: string }>(
      'select notes from measurement_items where measurement_id = $1 and contract_item_id = $2',
      [medicao, s.contrapisoId],
    )
    expect(item.notes).toBe('Executado no bloco da frente, conforme foto.')
  })

  it('observação vazia não vira texto vazio no banco', async () => {
    await sql('select save_measurement_items($1, $2::jsonb)', [
      medicao,
      JSON.stringify([
        { contract_item_id: s.contrapisoId, qty_requested: 20, notes: null },
      ]),
    ])
    const [item] = await sql<{ notes: string | null }>(
      'select notes from measurement_items where measurement_id = $1 and contract_item_id = $2',
      [medicao, s.contrapisoId],
    )
    expect(item.notes).toBeNull()
  })
})
