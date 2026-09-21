# Fluxo de Medição do Empreiteiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O empreiteiro abre a plataforma no celular a partir da Home, entra no fluxo de medição da competência aberta, navega pelas etapas e locais (casas/pavimentos), preenche as quantidades por serviço (podendo alternar entre metragem física e percentual relativo ao local), revisa o resumo e envia a medição, recebendo o protocolo oficial sequencial com trava anti-concorrência.

**Architecture:** Next.js 16 App Router + Supabase Postgres com RLS completo (leitura e escrita). As Server Actions utilizam `createServerSupabase()` carregando o token do usuário autenticado para garantir que toda operação respeite as regras de RLS e triggers de saldo e período no Postgres. Cálculos financeiros e de saldo são providos por funções SQL para garantir consistência absoluta entre frontend e backend.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, `@supabase/ssr`, `@supabase/supabase-js` 2.116, Tailwind 4, Vitest, Playwright (perfil mobile Pixel 7).

---

## Global Constraints

- **Next.js 16 App Router:** `cookies()` de `next/headers` é assíncrono (`await cookies()`). `proxy.ts` (não `middleware.ts`) renova os cookies de sessão.
- **Autorização é da RLS:** Nenhuma consulta ou mutação em `src/` deve filtrar explicitamente por `contractor_id` ou `company_id`. A RLS e os triggers do Postgres garantem o isolamento.
- **`SERVICE_ROLE_KEY` proibida em `src/`:** Apenas seed e suítes de teste de baixo nível utilizam service role. Todo código de aplicação opera com a chave anônima e o JWT do usuário autenticado.
- **Aritmética financeira no banco:** Valores monetários e quantitativos são `numeric(14,4)`. Conversões de percentual ⇄ metragem no cliente operam sobre a quantidade **do local específico**, nunca do contrato inteiro.
- **Mobile-first:** Elementos de toque com pelo menos 48px de altura, inputs com `text-base` (16px) contra zoom do Safari/iOS, layout responsivo e teclado numérico adaptado.
- **Migrations imutáveis:** A próxima migration livre é a `014`.

---

## Estado herdado do Plano 2

- 13 migrations (`001` a `013`), cobrindo tenancy, obras, contratos, medições, saldo, fluxo, auditoria, reabertura, NF, buckets e resumo financeiro.
- Usuários de demonstração no seed: `alfa@demo.test`, `beta@demo.test`, `engenharia@demo.test`, `gerencia@demo.test` (senha `demo1234`).
- Telas funcionais: `/entrar`, `/`, `/sair`.
- 129 testes automatizados passando (117 suíte principal + 12 seed) e 5 testes E2E do Playwright.

---

### Task 1: Policies de escrita de medição (RLS) e permissão de submissão

Hoje, o banco só possui policies de leitura (`for select`). Toda mutação passava por `service_role`. O empreiteiro precisa conseguir criar seu rascunho de medição, adicionar/atualizar/remover itens e enviar a medição via RLS autenticada.

**Files:**
- Create: `supabase/migrations/014_medicao_escrita.sql`
- Test: `tests/medicao-escrita.test.ts`

**Interfaces:**
- Policies em `measurements`:
  - `insert`: usuário autenticado pertencente à empresa, para contrato que ele pode ler (`can_read_contract(contract_id)`), período aberto (`is_period_open`), status inicial obrigatório `'RASCUNHO'`.
  - `update`: usuário autenticado para seu contrato, em status `'RASCUNHO'` ou `'DEVOLVIDA'`, período aberto.
  - `delete`: usuário autenticado para seu contrato, somente enquanto `'RASCUNHO'`.
- Policies em `measurement_items`:
  - `insert`: usuário autenticado onde a medição pai está em `'RASCUNHO'` ou `'DEVOLVIDA'`, `can_read_contract`, item de contrato pertencente ao mesmo contrato.
  - `update`: usuário autenticado onde a medição pai está em `'RASCUNHO'` ou `'DEVOLVIDA'`, podendo alterar `qty_requested` e `notes`.
  - `delete`: usuário autenticado onde a medição pai está em `'RASCUNHO'` ou `'DEVOLVIDA'`.
- Função `submit_measurement(p_measurement_id uuid)` marcada com `security definer` (já possui `pg_advisory_xact_lock` de obra/competência para serializar protocolos concorrentes) e verificação de que quem chama tem acesso ao contrato.

- [ ] **Step 1: Escrever teste de isolamento e permissão de escrita**
- [ ] **Step 2: Rodar o teste para ver falhar**
- [ ] **Step 3: Criar migration `014_medicao_escrita.sql`**
- [ ] **Step 4: Aplicar migration e verificar testes**
- [ ] **Step 5: Rodar suíte completa `npm run test:all`**
- [ ] **Step 6: Commit**

---

### Task 2: Funções SQL e dados de navegação da medição (Etapa → Local → Serviços com Saldo)

O empreiteiro precisa navegar na estrutura do contrato: selecionar a Etapa, ver os Locais com progresso (% medido ou quantidade de itens medidos) e listar os serviços do local com saldo disponível em tempo real.

**Files:**
- Create: `supabase/migrations/015_consulta_medicao.sql`
- Create: `src/lib/medicao/dados.ts`
- Test: `tests/medicao-navegacao.test.ts`

**Interfaces:**
- Produces:
  - `get_or_create_draft(p_contract_id uuid)`: obtém a medição ativa (`RASCUNHO` ou `DEVOLVIDA`) na competência aberta corrente, ou cria um novo `RASCUNHO`.
  - `get_measurement_stages_and_units(p_measurement_id uuid)`: lista etapas e locais vinculados ao contrato da medição com contagem de itens totais e preenchidos no rascunho.
  - `get_unit_services_for_measurement(p_measurement_id uuid, p_unit_id uuid)`: lista serviços daquele local com quantidade total contratada, valor unitário, saldo a medir, quantidade preenchida no rascunho atual e subtotal.
  - Módulo `src/lib/medicao/dados.ts` expondo funções TypeScript tipadas consumindo o Supabase do servidor.

- [ ] **Step 1: Escrever testes de navegação e integridade de saldo**
- [ ] **Step 2: Rodar para ver falhar**
- [ ] **Step 3: Escrever migration `015_consulta_medicao.sql` e funções de dados**
- [ ] **Step 4: Aplicar e validar testes**
- [ ] **Step 5: Commit**

---

### Task 3: Conversor Metragem ⇄ Percentual e validação ao vivo

Conforme regra confirmada de domínio: a porcentagem é sempre relativa à quantidade do **local específico**, nunca do contrato inteiro. O cálculo deve ser puramente determinístico, com tolerância a arredondamentos.

**Files:**
- Create: `src/app/medicao/conversao.ts`
- Test: `tests/conversao.test.ts`

**Interfaces:**
- Produces:
  - `qtyFromPercent(localQty: number, percent: number): number`
  - `percentFromQty(localQty: number, qty: number): number`
  - `validateQty(qty: number, balance: number): { valid: boolean; error?: string }`
  - `calcSubtotal(qty: number, unitPrice: number): number`

- [ ] **Step 1: Escrever testes unitários para conversão e validação**
- [ ] **Step 2: Rodar para ver falhar**
- [ ] **Step 3: Implementar `src/app/medicao/conversao.ts`**
- [ ] **Step 4: Rodar testes e checar TypeScript**
- [ ] **Step 5: Commit**

---

### Task 4: Tela de seleção de Etapa e Locais (`/medicao`)

Lista as etapas da obra e os locais (casas/pavimentos), com barra de busca por nome do local e progresso visual de preenchimento.

**Files:**
- Modify: `src/app/page.tsx` (habilitar botão "Fazer minha medição")
- Create: `src/app/medicao/page.tsx`
- Create: `src/app/medicao/components/ListaLocais.tsx`
- Test: `tests/medicao-page.test.ts`

**Interfaces:**
- Redireciona para `/entrar` se deslogado.
- Se não houver período aberto, exibe aviso e botão de retorno.
- Exibe cabeçalho com número do contrato, obra e competência.
- Campo de busca rápida por local.
- Lista agrupada por etapa com status de cada local (ex: "3 de 5 serviços preenchidos" ou "Pendente").
- Botão no rodapé: "Revisar e Enviar" (habilitado se houver ao menos 1 item medido no rascunho).

- [ ] **Step 1: Ativar link na Home (`src/app/page.tsx`)**
- [ ] **Step 2: Implementar página `/medicao` e componente `ListaLocais`**
- [ ] **Step 3: Validar visualização e build do Next.js**
- [ ] **Step 4: Commit**

---

### Task 5: Tela de preenchimento dos serviços do local (`/medicao/local/[unitId]`)

Tela detalhada onde o empreiteiro digita as medições dos serviços daquele local.

**Files:**
- Create: `src/app/medicao/local/[unitId]/page.tsx`
- Create: `src/app/medicao/local/[unitId]/LinhaServico.tsx`
- Create: `src/app/medicao/acoes.ts` (Server Action `salvarMedicaoLocal`)
- Test: `tests/medicao-acoes.test.ts`

**Interfaces:**
- Lista serviços daquele local.
- Cada linha exibe:
  - Nome do serviço e grupo.
  - Quantidade total do local e unidade.
  - Saldo disponível para medição.
  - Input numérico com seletor Metragem ⇄ %.
  - Subtotal monetário da linha calculado ao vivo.
- Rodapé:
  - Valor total medido no local (R$).
  - Botão "Salvar e voltar aos locais".

- [ ] **Step 1: Escrever Server Action `salvarMedicaoLocal` com testes**
- [ ] **Step 2: Implementar página e componente cliente `LinhaServico` com alternância metragem/%**
- [ ] **Step 3: Validar limites de saldo com feedback imediato**
- [ ] **Step 4: Commit**

---

### Task 6: Tela de revisão, envio e confirmação (`/medicao/revisao`)

Revisão consolidada de todos os serviços medidos no rascunho antes do envio formal.

**Files:**
- Create: `src/app/medicao/revisao/page.tsx`
- Create: `src/app/medicao/revisao/ConfirmacaoEnvio.tsx`
- Modify: `src/app/medicao/acoes.ts` (Server Action `enviarMedicao`)

**Interfaces:**
- Lista apenas os locais e serviços com quantidade solicitada > 0.
- Total consolidado da medição (R$).
- Bloqueio se não houver nenhum item medido.
- Modal/confirmação com aviso de imutabilidade após envio.
- Ao submeter: executa `submit_measurement`, que gera o protocolo oficial sequencial com lock e avança o status para `EM_ANALISE`.
- Exibe tela de sucesso com o Protocolo (`MED-2026-09-001`) e botão para voltar à Home.

- [ ] **Step 1: Implementar Server Action `enviarMedicao`**
- [ ] **Step 2: Implementar tela de revisão e envio**
- [ ] **Step 3: Implementar tela/estado de confirmação com protocolo gerado**
- [ ] **Step 4: Commit**

---

### Task 7: Suíte de testes E2E do fluxo completo (Playwright Pixel 7)

Garante ponta a ponta que o empreiteiro executa o ciclo completo em tela móvel.

**Files:**
- Create: `e2e/medicao.spec.ts`

**Cenários E2E:**
1. Login como `alfa@demo.test` -> Home -> clica em "Fazer minha medição".
2. Entra na lista de locais -> seleciona Casa 01.
3. Preenche Contrapiso em metros e Alvenaria em percentual.
4. Tenta ultrapassar o saldo -> verifica mensagem de bloqueio.
5. Salva local e volta -> Casa 01 exibe badge de medido.
6. Clica em "Revisar medição" -> confere lista consolidada e valor total.
7. Clica em "Enviar medição" -> confirmação gera protocolo `MED-YYYY-MM-NNN`.
8. Retorna para a Home -> resumo do contrato atualizado ("Em aprovação" aumentou, "Saldo a medir" reduziu).

- [ ] **Step 1: Escrever cenários no `e2e/medicao.spec.ts`**
- [ ] **Step 2: Executar `npm run e2e`**
- [ ] **Step 3: Rodar suíte completa `npm run test:all` e `tsc --noEmit`**
- [ ] **Step 4: Commit**
