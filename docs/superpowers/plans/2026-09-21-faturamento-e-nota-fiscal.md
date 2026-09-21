# Implementation Plan — Plano 5: Emissão de Nota Fiscal pelo Empreiteiro e Faturamento / Financeiro

Com base na especificação [docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md](file:///C:/Users/gusta/orca/projects/Empreeteira_Pedro/docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md), este plano implementa o fechamento fiscal e financeiro do ciclo de medição:
1. O empreiteiro recebe a liberação da medição aprovada e anexa a Nota Fiscal com arquivo PDF.
2. A construtora confere o documento, aprova ou rejeita com motivo, e registra a liquidação/pagamento.
3. O extrato financeiro da obra e o histórico do contrato refletem o status faturado e pago.

---

## User Review Required

> [!IMPORTANT]
> - O upload de PDF da Nota Fiscal é feito no bucket `notas-fiscais` com o `company_id` como primeiro segmento do caminho (`{companyId}/notas/{measurementId}/{filename}`).
> - A aprovação e quitação de Notas Fiscais é permitida para papéis internos da construtora: `financeiro`, `gerencia` e `admin`.
> - Se a Nota Fiscal for rejeitada pelo financeiro, um motivo é obrigatório e a medição retorna ao status `APROVADA` para permitir novo anexo corrigido pelo empreiteiro.

---

## Proposed Changes

### Banco e Regras de Negócio

#### [NEW] `supabase/migrations/019_faturamento_nf.sql`
- Aprimoramento de `submit_invoice`: validação de permissão via `can_read_contract`, validação de status `APROVADA`, verificação de tolerância de valor configurada na obra (`invoice_tolerance`), inserção na tabela `invoices`, transição para `NF_ENVIADA` e auditoria.
- Criação de `approve_invoice(p_invoice_id uuid)`: valida perfil financeiro/gerência/admin, avança a nota para `APROVADA` e a medição para `NF_APROVADA`, grava auditoria.
- Criação de `reject_invoice(p_invoice_id uuid, p_reason text)`: valida perfil, exige motivo, marca a nota como `REJEITADA`, retorna a medição para `APROVADA` e grava auditoria com o motivo.
- Criação de `pay_invoice(p_invoice_id uuid)`: valida perfil, marca a nota e a medição como `PAGA`, grava auditoria.
- Funções de apoio para consulta:
  - `get_pending_invoices()`: lista medições em `NF_ENVIADA` e `NF_APROVADA` com dados da NF e do empreiteiro.
  - `get_measurement_invoice_details(p_measurement_id uuid)`: retorna dados consolidados da medição e notas fiscais emitidas.

---

### Camada de Aplicação e Server Actions

#### [NEW] `src/lib/faturamento/dados.ts`
- `obterDadosMedicaoParaNF(measurementId: string)`: busca dados do contrato, protocolo e valor aprovado para a tela de envio de NF do empreiteiro.
- `listarNotasPendentes()`: busca medições com NFs pendentes de conferência e pagamento para a construtora.
- `obterDetalhesNotaFiscal(measurementId: string)`: busca detalhes completos da medição, NF e arquivo PDF para conferência.

#### [NEW] `src/app/faturamento/acoes.ts`
- Server Action `enviarNotaFiscalAction`: valida dados da NF e executa `submit_invoice`.
- Server Action `aprovarNotaFiscalAction`: executa `approve_invoice`.
- Server Action `rejeitarNotaFiscalAction`: executa `reject_invoice` com motivo.
- Server Action `marcarComoPagaAction`: executa `pay_invoice`.

---

### Interface do Empreiteiro (Mobile-First)

#### [NEW] `src/app/medicoes/[measurementId]/nf/page.tsx`
- Tela móvel para emissão e anexo da Nota Fiscal:
  - Resumo do valor líquido aprovado da medição (R$) e margem de tolerância.
  - Inputs: Número da Nota, Data de Emissão, Valor da Nota (com validação client-side e feedback de divergência aceita).
  - Upload de arquivo PDF com envio para o bucket `notas-fiscais`.
  - Confirmação com feedback visual de sucesso e protocolo associado.

#### [MODIFY] `src/app/medicoes/page.tsx`
- Adiciona botão "Emitir / Anexar NF" nos cards com status `APROVADA`.
- Adiciona exibição de motivo de rejeição de NF se a última nota tiver sido rejeitada.

---

### Interface da Construtora (Desktop)

#### [NEW] `src/app/faturamento/page.tsx`
- Painel corporativo de faturamento:
  - Cabeçalho com navegação entre "Aprovações da Engenharia" (`/analise`) e "Faturamento e NFs" (`/faturamento`).
  - Abas ou filtros por status: "Em conferência" (`NF_ENVIADA`) e "Prontas para pagamento" (`NF_APROVADA`).
  - Tabela com protocolo, empreiteiro, obra, número da NF, valor da nota vs valor aprovado, link para PDF.
  - Ações diretas: Aprovar Nota, Rejeitar Nota (com modal de motivo) e Registrar Pagamento.

#### [NEW] `src/app/faturamento/components/TabelaFaturamento.tsx`
- Componente cliente para visualização interativa, busca, modal de rejeição e ações de aprovação e pagamento.

#### [MODIFY] `src/app/analise/page.tsx`
- Adiciona link de navegação para a tela de faturamento no cabeçalho corporativo.

---

### Testes Automatizados e E2E

#### [NEW] `tests/faturamento-fluxo.test.ts`
- Testes de unidade/integração no banco:
  - Envio de NF com valor igual ao aprovado -> transição para `NF_ENVIADA`.
  - Envio de NF divergente fora da tolerância -> erro `check_violation`.
  - Aprovação de NF por usuário financeiro -> transição para `NF_APROVADA`.
  - Rejeição de NF com motivo -> transição para `APROVADA` e nota `REJEITADA`.
  - Liquidação/pagamento de NF -> transição para `PAGA`.
  - Controle negativo: empreiteiro não consegue aprovar/pagar NF de ninguém.

#### [NEW] `e2e/faturamento.spec.ts`
- Cenário E2E Playwright completo:
  1. Empreiteiro Alfa tem medição aprovada -> entra em "Medições anteriores" (`/medicoes`).
  2. Clica em "Emitir / Anexar NF" -> preenche formulário de NF e anexa PDF.
  3. Engenharia/Financeiro acessa `/faturamento` -> visualiza a NF pendente.
  4. Financeiro aprova a NF -> medição passa para `NF_APROVADA`.
  5. Financeiro clica em "Registrar Pagamento" -> medição passa para `PAGA`.
  6. Empreiteiro Alfa acessa o extrato inicial (`/`) e histórico (`/medicoes`) -> confirma que o status é `PAGA` e o valor pago reflete no resumo do contrato.

---

## Verification Plan

### Automated Tests
1. `npm test` -> todos os testes de unidade passando.
2. `npm run test:all` -> suíte completa + seed passando.
3. `npx playwright test` -> todos os testes E2E passando (incluindo `faturamento.spec.ts`).
4. `npx tsc --noEmit` -> 0 erros de tipagem TypeScript.
5. `npm run build` -> compilação Turbopack sem erros.
