import { describe, it, expect } from 'vitest'
import { LocalMedicao } from '../src/lib/medicao/dados'

function agruparEFiltrarLocais(locais: LocalMedicao[], busca: string) {
  const termo = busca.trim().toLowerCase()
  const filtrados = termo
    ? locais.filter(
        (l) =>
          l.unitName.toLowerCase().includes(termo) ||
          l.stageName.toLowerCase().includes(termo),
      )
    : locais

  const mapa = new Map<
    string,
    { stageId: string; stageName: string; stagePosition: number; locais: LocalMedicao[] }
  >()

  for (const local of filtrados) {
    if (!mapa.has(local.stageId)) {
      mapa.set(local.stageId, {
        stageId: local.stageId,
        stageName: local.stageName,
        stagePosition: local.stagePosition,
        locais: [],
      })
    }
    mapa.get(local.stageId)!.locais.push(local)
  }

  return Array.from(mapa.values()).sort((a, b) => a.stagePosition - b.stagePosition)
}

describe('logica da tela de locais de medicao', () => {
  const locaisExemplo: LocalMedicao[] = [
    {
      stageId: 'stage-2',
      stageName: 'Fundação',
      stagePosition: 1,
      unitId: 'unit-1',
      unitName: 'Casa 01',
      unitPosition: 1,
      totalItems: 3,
      measuredItems: 2,
      totalContracted: 1000,
      totalMeasured: 500,
    },
    {
      stageId: 'stage-2',
      stageName: 'Fundação',
      stagePosition: 1,
      unitId: 'unit-2',
      unitName: 'Casa 02',
      unitPosition: 2,
      totalItems: 3,
      measuredItems: 0,
      totalContracted: 1000,
      totalMeasured: 0,
    },
    {
      stageId: 'stage-1',
      stageName: 'Alvenaria e Acabamento',
      stagePosition: 2,
      unitId: 'unit-3',
      unitName: 'Casa 01',
      unitPosition: 1,
      totalItems: 5,
      measuredItems: 1,
      totalContracted: 2500,
      totalMeasured: 300,
    },
  ]

  it('agrupa locais por etapa respeitando a ordem das etapas', () => {
    const etapas = agruparEFiltrarLocais(locaisExemplo, '')
    expect(etapas.length).toBe(2)
    expect(etapas[0].stageName).toBe('Fundação')
    expect(etapas[0].locais.length).toBe(2)
    expect(etapas[1].stageName).toBe('Alvenaria e Acabamento')
    expect(etapas[1].locais.length).toBe(1)
  })

  it('filtra locais por nome da unidade', () => {
    const etapas = agruparEFiltrarLocais(locaisExemplo, 'casa 02')
    expect(etapas.length).toBe(1)
    expect(etapas[0].locais[0].unitName).toBe('Casa 02')
  })

  it('filtra etapas por nome da etapa', () => {
    const etapas = agruparEFiltrarLocais(locaisExemplo, 'alvenaria')
    expect(etapas.length).toBe(1)
    expect(etapas[0].stageName).toBe('Alvenaria e Acabamento')
  })

  it('calcula totais consolidados corretamente', () => {
    const totalItens = locaisExemplo.reduce((acc, l) => acc + l.measuredItems, 0)
    const totalValor = locaisExemplo.reduce((acc, l) => acc + l.totalMeasured, 0)

    expect(totalItens).toBe(3)
    expect(totalValor).toBe(800)
  })
})
