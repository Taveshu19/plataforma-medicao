# Melhorias pedidas pelo Pedro — Trilha de status e Meu Contrato

**Origem:** primeiro teste do produto com o Pedro, em 2026-09-21.
**Executado por:** sessão única, sem delegação. Plano curto de propósito.

**Goal:** o empreiteiro vê, na tela inicial, em que ponto do processo sua medição está; e na tela do contrato vê o total de cada serviço somando todas as casas, antes de descer ao detalhe.

## O que o Pedro pediu, nas palavras dele

> Tela inicial: adicionar o status da medição atual. Por exemplo: ⭕Criar medição pendente > aprovação estagiário > aprovação engenheiro > aprovação gerência > liberado emissão de NF > pagamento previsto dia X. E as bolinhas vão ficando verde conforme for andando o processo.

> No meu contrato eu adicionaria 2 coisas. No topo um botão onde tem o contrato oficial em PDF caso queira. E logo após os quantitativos gerais — por exemplo quantos m² ele tem total do serviço de contrapiso juntando todas as casas, no mesmo modelo de quanto recebeu e quanto tem a receber, isso pra todos os serviços. E após isso embaixo ele poderia clicar em um botão "a receber/executado por casa". Acredito que se adicionar tudo numa página só ficaria muito longo, por isso a ideia de pôr este botão.

## Decisões de desenho

**A trilha nasce da configuração, não do código.** O Pedro citou "aprovação estagiário", que não existe nesta obra — ele está mostrando que espera níveis variáveis. A tabela `approval_levels` já é por obra, então a trilha é montada a partir dela. Acrescentar um nível vira uma linha no banco, não uma alteração de tela.

**"Pagamento previsto dia X" exige um campo que não existe.** `invoices` não tem data prevista de pagamento. Entra como coluna nova, preenchida pelo financeiro ao aprovar a nota. Sem ela a trilha mostraria uma promessa vazia.

**O "contrato oficial em PDF" vira folha imprimível gerada pelo sistema.** Não há documento assinado no banco, e subir um arquivo de exemplo no seed não prova nada. A folha imprimível funciona hoje, na demonstração, e segue o padrão do espelho de medição que já existe. Anexar o contrato assinado de verdade fica como passo seguinte, quando houver construtora real com documento para subir.

**Agregação por serviço agrupa por nome e unidade.** Somar "Contrapiso em m²" com um eventual "Contrapiso em verba" daria um número sem significado.

---

## Task 1 — Migration 021: agregação por serviço, progresso e data prevista

**Entrega:**
- `get_contract_services_summary(p_contract_id)` — uma linha por serviço/unidade com quantidade contratada, medida e saldo, mais os valores correspondentes.
- `get_current_measurement_progress(p_contract_id)` — a medição viva do contrato com status, nível atual, protocolo, competência e dados da nota.
- Coluna `invoices.expected_payment_date`.

**Prova:** testes em `tests/contrato-resumo.test.ts` cobrindo agregação entre casas, o que conta como medido, e a ausência de medição.

## Task 2 — Trilha de status na tela inicial

**Entrega:** componente que monta os passos a partir de `approval_levels` e marca cada um como concluído, atual ou pendente, conforme status e nível da medição.

**Prova:** testes da função pura que monta os passos, em `tests/trilha.test.ts`.

## Task 3 — Meu Contrato: quantitativos por serviço e detalhe por casa

**Entrega:** seção nova no topo com o total de cada serviço somando todas as casas, e o detalhe por casa recolhido atrás de um botão.

## Task 4 — Folha do contrato para impressão

**Entrega:** `/contrato/folha`, imprimível, com cabeçalho, itens e totais. Botão no topo de "Meu Contrato".

## Task 5 — Data prevista de pagamento no faturamento

**Entrega:** o financeiro informa a data ao aprovar a nota; a trilha passa a mostrá-la.

---

## Verificação final

- Suíte completa verde.
- `npx tsc --noEmit` limpo.
- `npm run build` limpo.
- Verificado no navegador, pelo túnel, com build de produção.
- **Seed reposto** ao final: a suíte principal apaga os dados de demonstração.
