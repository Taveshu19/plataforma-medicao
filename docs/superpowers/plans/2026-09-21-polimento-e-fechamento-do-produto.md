# Implementation Plan — Polimento e Fechamento do Produto

Este plano implementa as funcionalidades de fechamento da plataforma conforme a especificação [docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md](file:///C:/Users/gusta/orca/projects/Empreeteira_Pedro/docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md):
1. **Meu Contrato (`/contrato`):** Ativação da tela de detalhamento contratual para o empreiteiro auditar todos os serviços, quantidades, preços unitários e saldos por local.
2. **Espelho de Medição e Impressão (`/medicoes/[measurementId]/espelho`):** Documento oficial com cabeçalho, planilha de serviços solicitados vs aprovados, situação fiscal e campos de assinatura para formalização e impressão.
3. **Linha do Tempo de Auditoria:** Histórico cronológico detalhado de todos os eventos da medição na tela da engenharia (`/analise/[measurementId]`).
4. **Filtros e Abas por Status no Painel da Engenharia (`/analise`):** Navegação entre medições em análise, aprovadas, devolvidas e faturadas.

---

## Proposed Changes

### Banco de Dados
#### [NEW] `supabase/migrations/020_auditoria_espelho_e_contrato.sql`
- `get_measurement_audit_timeline(p_measurement_id uuid)`: retorna histórico cronológico de `audit_log` com autor, papel, ação, valores anterior/novo e motivo.
- `get_contract_items_overview(p_contract_id uuid)`: retorna itens do contrato agrupados por etapa e local com quantidades contratadas, medidas e saldo disponível.
- `get_company_measurements(p_status text default null)`: listagem flexível de medições para a construtora com filtro opcional de status.
- `get_measurement_statement(p_measurement_id uuid)`: consolidação de cabeçalho, itens e assinaturas para o espelho de medição.

### Camada de Aplicação
#### [NEW] `src/lib/contrato/dados.ts`
- `obterVisaoContrato(contractId: string)`: busca resumo e itens do contrato.
#### [MODIFY] `src/lib/aprovacao/dados.ts`
- Adiciona `obterLinhaDoTempoAuditoria(measurementId: string)` e `listarMedicoesPorStatus(status?: string)`.
#### [NEW] `src/lib/espelho/dados.ts`
- `obterEspelhoMedicao(measurementId: string)`: busca dados estruturados para o espelho.

### Frontend
#### [NEW] `src/app/contrato/page.tsx`
- Tela móvel "Meu Contrato" para o empreiteiro.
#### [MODIFY] `src/app/page.tsx`
- Ativação do link "Meu contrato" e limpeza de texto pendente.
#### [NEW] `src/app/medicoes/[measurementId]/espelho/page.tsx`
- Espelho de medição responsivo com layout de impressão (`@media print`) e botão de imprimir/PDF.
#### [MODIFY] `src/app/medicoes/page.tsx`
- Adiciona botão "Ver Espelho" nos cards de medições.
#### [MODIFY] `src/app/analise/[measurementId]/page.tsx`
- Adiciona linha do tempo de auditoria e botão "Ver Espelho".
#### [MODIFY] `src/app/analise/components/TabelaMedicoes.tsx`
- Adiciona abas por status ("Em análise", "Aprovadas", "Devolvidas", "Todas").

---

## Verification Plan
1. `npm test` -> todos os testes de unidade passando (incluindo novas suítes).
2. `npm run test:seed` -> reset do banco com migration 020 e testes de seed passando.
3. `npx playwright test` -> todos os testes E2E passando.
4. `npx tsc --noEmit` -> 0 erros TypeScript.
5. `npm run build` -> compilação Turbopack verde.
