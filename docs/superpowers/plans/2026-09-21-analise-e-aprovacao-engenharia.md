# Painel de Análise e Aprovação da Engenharia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que os usuários internos da construtora (Engenharia, Coordenação, Gerência) analisem as medições submetidas (`EM_ANALISE`), ajustem as quantidades aprovadas (`qty_approved`) para mais ou para menos com validação estrita de saldo e auditoria automática, aprovem avançando no fluxo de múltiplos níveis ou devolvam com motivo obrigatório. No lado do empreiteiro, permitir o acompanhamento do histórico de medições (`/medicoes`) com protocolos, status e justificativas.

**Architecture:** Next.js 16 App Router + Supabase Postgres com RLS e RPCs de workflow `security definer`. O controle de aprovação verifica a correspondência do nível atual (`current_level`) da medição com a permissão do usuário (`approval_levels.role`). A auditoria é registrada nativamente em `audit_log` com atores e valores anteriores/novos.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, `@supabase/ssr`, Tailwind 4, Vitest, Playwright.

---

## Global Constraints

- **Next.js 16 App Router:** `cookies()` é assíncrono. Interceptação em `src/proxy.ts`.
- **Zero filtros manuais no código:** Toda autorização vem de RLS e funções de banco.
- **`SERVICE_ROLE_KEY` proibida em `src/`:** Todas as ações executam com o JWT do usuário autenticado.
- **Aritmética e Integridade de Saldo:** Ajustes de `qty_approved` para mais são rigorosamente validados contra o saldo disponível do item de contrato.
- **Auditoria Obrigatória:** Todo ajuste ou transição grava em `audit_log` com autor (`auth.uid()`), ação, valor anterior e novo.
- **Migrations:** A próxima migration livre é a `018`.

---

## Estado herdado do Plano 3

- 17 migrations (`001` a `017`), cobrindo todo o modelo relacional, saldo, auditoria, escrita de rascunhos pelo empreiteiro e protocolo resiliente.
- Suíte completa: 168 testes passando (156 principais + 12 seed) e 6 testes E2E do Playwright.
- Usuários do seed:
  - `alfa@demo.test` (empreiteiro Alfa)
  - `beta@demo.test` (empreiteiro Beta)
  - `engenharia@demo.test` (nível 1 - Engenharia)
  - `gerencia@demo.test` (nível 3 - Gerência)
  - Senha padrão: `demo1234`.

---

### Task 1: Permissões de Análise, Ajuste e Funções de Fluxo Seguras

Criar migration `018_analise_aprovacao.sql` para:
- Promover `approve_measurement` e `return_measurement` para `security definer set search_path = public` com validação de permissão de projeto e nível do usuário em `approval_levels`.
- Criar a função RPC `adjust_item_approved_qty(p_item_id uuid, p_qty_approved numeric)` com verificação de permissão, limite de saldo do contrato e gatilho de auditoria em `audit_log`.
- Criar função RPC `get_pending_measurements()` e `get_measurement_analysis_details(p_measurement_id uuid)` para alimentar o painel da engenharia.

**Files:**
- Create: `supabase/migrations/018_analise_aprovacao.sql`
- Test: `tests/analise-fluxo.test.ts`

- [ ] **Step 1: Escrever testes unitários e de integração de permissão e ajuste de saldo**
- [ ] **Step 2: Rodar teste para ver falhar**
- [ ] **Step 3: Criar migration `018_analise_aprovacao.sql`**
- [ ] **Step 4: Aplicar migration com `npx supabase db reset` e validar testes**
- [ ] **Step 5: Commit**

---

### Task 2: Helpers de Dados e Server Actions de Aprovação/Devolução

Criar métodos tipados em `src/lib/aprovacao/dados.ts` e Server Actions em `src/app/analise/acoes.ts`.

**Files:**
- Create: `src/lib/aprovacao/dados.ts`
- Create: `src/app/analise/acoes.ts`
- Test: `tests/analise-acoes.test.ts`

**Interfaces:**
- `listarMedicoesAnalise()`: retorna medições pendentes de análise para o usuário logado.
- `obterDetalhesAnalise(measurementId)`: retorna itens, solicitado vs aprovado, saldo e dados do contrato/empreiteiro.
- Server Action `ajustarQuantidadeAprovada(itemId, qtyApproved)`.
- Server Action `aprovarMedicao(measurementId)`.
- Server Action `devolverMedicao(measurementId, motivo)`.

- [ ] **Step 1: Implementar `src/lib/aprovacao/dados.ts` e testes**
- [ ] **Step 2: Implementar Server Actions em `src/app/analise/acoes.ts`**
- [ ] **Step 3: Validar TypeScript e Vitest**
- [ ] **Step 4: Commit**

---

### Task 3: Painel da Engenharia — Lista de Medições Recebidas (`/analise`)

Interface desktop e responsiva onde os membros da construtora visualizam as medições pendentes e histórico.

**Files:**
- Create: `src/app/analise/page.tsx`
- Create: `src/app/analise/components/TabelaMedicoes.tsx`

**Interfaces:**
- Diferenciação de perfil na Home `/`: se o usuário for membro da construtora (`contractor_id is null`), redireciona ou exibe link direto para `/analise`.
- Filtros rápidos por status (Em Análise, Aprovadas, Devolvidas).
- Tabela com Protocolo, Obra, Empreiteiro, Competência, Nível Atual, Valor Solicitado e Data de Envio.
- Link para a tela de análise detalhada de cada medição (`/analise/[measurementId]`).

- [ ] **Step 1: Implementar detecção de perfil ou rota `/analise`**
- [ ] **Step 2: Implementar página e componente de tabela com filtros**
- [ ] **Step 3: Validar build Next.js**
- [ ] **Step 4: Commit**

---

### Task 4: Tela de Análise e Ajuste de Quantidades (`/analise/[measurementId]`)

Tela central onde a engenharia confere item a item, rebalanceia quantidades e aprova/devolve.

**Files:**
- Create: `src/app/analise/[measurementId]/page.tsx`
- Create: `src/app/analise/[measurementId]/TabelaAjustes.tsx`
- Create: `src/app/analise/[measurementId]/ModalDevolucao.tsx`

**Interfaces:**
- Exibe cabeçalho com Protocolo, Empreiteiro, Obra, Competência e Nível de Aprovação Atual.
- Tabela com: Local, Serviço, Quantidade Solicitada, Saldo do Contrato, Quantidade Aprovada (editável), Subtotal Aprovado.
- Feedback em tempo real se o aprovador tentar colocar uma quantidade acima do saldo total.
- Totalizador da medição recalculado ao vivo.
- Botão "Salvar Ajustes".
- Botão "Aprovar Medição" (avança para o próximo nível ou finaliza se for o último).
- Botão "Devolver Medição" que abre modal exigindo preenchimento do motivo.

- [ ] **Step 1: Implementar componentes cliente `TabelaAjustes` e `ModalDevolucao`**
- [ ] **Step 2: Implementar página `/analise/[measurementId]/page.tsx`**
- [ ] **Step 3: Validar build e TypeScript**
- [ ] **Step 4: Commit**

---

### Task 5: Área do Empreiteiro — Histórico de Medições (`/medicoes`)

Ativar e implementar a visualização das medições anteriores para o empreiteiro.

**Files:**
- Modify: `src/app/page.tsx` (habilitar botão "Medições anteriores")
- Create: `src/app/medicoes/page.tsx`
- Create: `src/app/medicoes/[measurementId]/page.tsx`

**Interfaces:**
- Lista todas as medições do empreiteiro (passadas e atual).
- Badges de status coloridos: `Em Análise` (âmbar), `Aprovada` (verde), `Devolvida` (vermelho), `Paga` (azul).
- Se devolvida: destaque com o motivo informado pela engenharia e botão para editar/revisar o rascunho reaberto.
- Detalhes de cada medição com itens medidos, quantidades aprovadas e histórico.

- [ ] **Step 1: Ativar link na Home (`/`)**
- [ ] **Step 2: Implementar `/medicoes` e detalhe da medição**
- [ ] **Step 3: Validar build e testes**
- [ ] **Step 4: Commit**

---

### Task 6: Suíte E2E do Ciclo de Aprovação e Devolução (Playwright)

Cenário ponta a ponta integrando o empreiteiro e a equipe da engenharia.

**Files:**
- Create: `e2e/aprovacao.spec.ts`

**Cenários:**
1. Empreiteiro Alfa envia medição com 2 itens.
2. Logout -> Login como `engenharia@demo.test`.
3. Acessa `/analise`, localiza a medição do Alfa em `EM_ANALISE`.
4. Abre o detalhe, ajusta a quantidade de um dos itens para menos e salva.
5. Devolve a medição com motivo "Favor anexar foto do contrapiso".
6. Logout -> Login como `alfa@demo.test` -> vai em `/medicoes` -> vê status `DEVOLVIDA` e lê o motivo.
7. Reenvia a medição.
8. Engenharia aprova -> avança de nível.

- [ ] **Step 1: Escrever teste E2E `e2e/aprovacao.spec.ts`**
- [ ] **Step 2: Executar com `npx playwright test`**
- [ ] **Step 3: Executar `npm run test:all` e `tsc --noEmit`**
- [ ] **Step 4: Commit e atualização do HANDOFF.md**
