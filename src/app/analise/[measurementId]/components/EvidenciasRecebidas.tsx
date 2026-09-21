import type { AnexoMedicao } from '@/app/medicao/anexos'

/**
 * Fotos que o empreiteiro anexou, na tela de quem confere.
 *
 * É a razão de existir do anexo: sem isto o empreiteiro fotografaria para o
 * vazio e o engenheiro aprovaria no escuro. Agrupa por serviço para que a
 * pergunta "por que 20 m² de contrapiso?" tenha a foto do lado.
 */
export function EvidenciasRecebidas({
  anexos,
  nomePorItem,
}: {
  anexos: AnexoMedicao[]
  nomePorItem: Record<string, string>
}) {
  if (anexos.length === 0) return null

  const porItem = new Map<string, AnexoMedicao[]>()
  for (const anexo of anexos) {
    const chave = anexo.contractItemId ?? 'geral'
    porItem.set(chave, [...(porItem.get(chave) ?? []), anexo])
  }

  return (
    <section
      data-testid="evidencias-recebidas"
      className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h2 className="text-sm font-bold text-slate-900">
        Fotos enviadas pelo empreiteiro
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {anexos.length} {anexos.length === 1 ? 'foto anexada' : 'fotos anexadas'} como
        evidência do que foi executado.
      </p>

      <div className="mt-4 space-y-5">
        {[...porItem.entries()].map(([chave, lista]) => (
          <div key={chave}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {chave === 'geral' ? 'Medição (geral)' : nomePorItem[chave] ?? 'Serviço'}
            </h3>
            <ul className="mt-2 flex flex-wrap gap-3">
              {lista.map((anexo) => (
                <li key={anexo.id}>
                  <a href={anexo.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={anexo.url}
                      alt={`Evidência de ${chave === 'geral' ? 'medição' : nomePorItem[chave] ?? 'serviço'}`}
                      className="h-28 w-28 rounded-xl object-cover ring-1 ring-slate-200 transition hover:ring-slate-400"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
