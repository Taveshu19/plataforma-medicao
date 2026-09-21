# Handoff — execução do Plano 1 (Fundação de dados e regras)

**Escrito em:** 2026-09-21
**Motivo:** a sessão anterior atingiu o limite de uso. Este documento permite que outro agente, em outro harness, continue exatamente de onde parou.

---

## 1. Leia nesta ordem

1. `docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md` — o que o produto é e por quê. As decisões estruturais estão na seção 5, e as premissas marcadas na seção 10.
2. `docs/superpowers/plans/2026-09-21-fundacao-dados-e-regras.md` — o plano de 11 tarefas. **Fonte de verdade da implementação.** Contém o SQL e os testes literais de cada tarefa.
3. `.superpowers/sdd/2026-09-21-fundacao-dados-e-regras/progress.md` — **o ledger. Fonte de verdade do progresso.** Esse diretório é git-ignored; se ele sumir, reconstrua a partir do `git log`.

Os relatórios de cada tarefa (`task-N-report.md`) e os briefs (`task-N-brief.md`) estão no mesmo diretório do ledger.

---

## 2. Estado exato

**Branch:** `design/medicao-empreiteiros`. Árvore limpa. 13 commits.
**Testes:** 56/56 passando.
**Migrations aplicadas:** 001 a 007.

| Task | Estado | Commits |
|---|---|---|
| 1 — Scaffold | ✅ completa, revisada | `37423e8` |
| 2 — Tenancy e RLS | ✅ completa, 1 achado parked | `9a249ea`, `0bdc035` |
| 3 — Obras e escopo | ✅ completa, revisão limpa | `d209c24` |
| 4 — Contratos e % | ✅ completa, 1 bug corrigido | `14ed324`, `ea45c94` |
| 5 — Medições | ✅ completa, 1 achado roteado p/ Task 7 | `a4fc017` |
| **6 — Regra de saldo** | ⚠️ **MEIO DO LOOP** | `431d98a`, `3ac6837` |
| 7 a 11 | ⬜ não iniciadas | — |

---

## 3. AÇÃO IMEDIATA — terminar a Task 6

A Task 6 teve um furo **crítico** encontrado na revisão: o saldo não era revalidado quando a medição mudava de status. Dois rascunhos de 86 m² (competências diferentes) eram aceitos porque rascunho não consome saldo; promovendo os dois a `EM_ANALISE`, o saldo ia a −86 e o empreiteiro faturava **172 m² num item de 86**. Caminho de uso normal, não exótico.

A correção foi implementada e commitada em `3ac6837` (migration `007_saldo_na_transicao.sql`), com reprodução antes-e-depois documentada no relatório. **Mas a re-revisão escopada dessa correção nunca rodou** — o agente revisor morreu no limite de uso antes de começar.

**Portanto: rode a re-revisão antes de tocar na Task 7.** Não pule. A correção parece boa, mas "parece boa" é exatamente o que se disse do código que tinha o furo.

Diff a revisar: `git diff 431d98a..3ac6837`

Os achados a verificar, um a um (ADDRESSED / NOT ADDRESSED):

- **C1 (crítico)** — saldo revalidado na transição de status. O trigger novo só deve revalidar quando entra num status consumidor vindo de um não-consumidor, e deve chamar `contract_item_balance(item, new.id)` excluindo a própria medição. Se revalidasse sempre, uma medição já `EM_ANALISE` sendo aprovada se compararia contra um saldo que já a desconta, e falharia indevidamente.
- **I1** — `select ... for update` na linha de `contract_items` **antes** de calcular o saldo, em **ambos** os triggers.
- **I2** — cobertura de teste dos 5 status que consomem saldo. **Verifique rodando a mutação você mesmo:** remova `NF_ENVIADA` e `NF_APROVADA` da lista de status consumidores, rode a suíte, confirme que agora falha, e restaure. Se continuar verde, a correção não vale nada.
- **I3** — o trigger de `measurement_items` dispara em qualquer INSERT/UPDATE (a lista `update of` foi removida). Teste trocando `contract_item_id` de um item.
- **Integridade** — validação de que o `contract_item` pertence ao contrato da medição.
- **Menores** — `security definer set search_path = public` em `contract_item_balance()`; `trim_scale()` na mensagem de erro; regexes de teste apertados para `/maximo permitido e N/`.

Verifique também se há caminho remanescente para o mesmo furo: mudança de status que não passe pelo trigger; dois rascunhos promovidos na mesma transação; promover a medição e inserir itens na mesma transação.

Se tudo voltar ADDRESSED e sem quebra nova, marque a Task 6 como completa no ledger e mova `GUS-33` para Done no Linear.

---

## 4. Requisitos carregados para as tarefas seguintes

Estes vieram de revisões anteriores e **não estão no texto do plano**. Se você despachar as tarefas sem eles, os achados voltam.

### Task 7 (fluxo) — dois requisitos obrigatórios

**(a) Lock no protocolo.** `next_protocol()` calcula o sequencial com `count(*) + 1`, sem lock. Dois envios simultâneos na mesma obra e competência podem computar o mesmo número; o `unique` em `protocol` impede duplicata, mas a transação perdedora leva erro `23505` e o empreiteiro precisa reenviar — justamente no dia 10, quando todos correm. Adicione `pg_advisory_xact_lock` por `(project_id, competence)` dentro de `submit_measurement()`, antes de chamar `next_protocol()`.

**(b) Consistência com o trigger de transição.** O trigger criado na correção da Task 6 tem uma lista interna de status que consomem saldo (`v_consuming`). Se a Task 7 acrescentar qualquer status novo à lista de consumo, ele precisa entrar **nos dois lugares**: `v_consuming` do trigger de transição e a lista dentro de `contract_item_balance()`. Esquecer um dos dois reabre o furo crítico.

### Todas as tarefas — padrão de período

`measurements_one_active` é um índice único parcial: uma medição viva por `(period_id, contract_id)`, excluindo `CANCELADA`. Testes que criem **duas medições para o mesmo contrato** precisam usar **competências distintas** — foi isso que quebrou dois testes do brief da Task 6. Existe o helper `createMeasurementInNewPeriod` em `tests/saldo.test.ts` se precisar de referência.

### Task 9 (reabertura) — atenção

O `buildScenario()` atual cria o período com `closes_at` em 2026-09-10, que já passou. A Task 9 introduz o trigger de janela de medição, e o Step 4 dela **manda ajustar `tests/helpers/scenario.ts`** para uma janela sempre aberta (`now() - interval '1 day'` a `now() + interval '9 days'`), mantendo a competência em 2026-09-01. Sem esse ajuste, todos os testes anteriores quebram de uma vez. Rode a suíte inteira depois.

### Task 10 — pendência aberta desde a Task 1

Ninguém testou ainda uma chamada real ao endpoint de Storage (upload/download). O container `supabase_storage` está healthy, mas `imgproxy` não sobe — isso é o **default da CLI** (`enabled = false` em `config.toml`), não falha. Só transformação de imagem exigiria `imgproxy`, e a Task 10 não precisa disso.

---

## 5. O processo (uma tarefa por vez)

Para cada tarefa de 7 a 11:

1. **Registre o BASE:** `git rev-parse HEAD`.
2. **Extraia o brief** da tarefa N do plano para um arquivo próprio. Se o harness tiver os scripts do superpowers, use `scripts/task-brief PLAN N`; senão, copie a seção `### Task N:` do plano para `.superpowers/sdd/2026-09-21-fundacao-dados-e-regras/task-N-brief.md`.
3. **Despache um implementador** com: o caminho do brief (é a especificação, valores literais), o estado do repositório, as armadilhas de ambiente (seção 6), a barra de qualidade (seção 7) e o caminho do relatório a escrever. Nunca mande o agente ler o plano inteiro.
4. **Gere o pacote de revisão:** `git log --oneline BASE..HEAD`, `git diff --stat BASE..HEAD` e `git diff -U10 BASE..HEAD` redirecionados para um arquivo único. Passe o caminho ao revisor — não cole o diff no prompt.
5. **Despache um revisor** com brief + relatório + diff, pedindo veredito de **conformidade com spec** e de **qualidade**, e achados classificados Crítico/Importante/Menor. Peça verificação independente no banco, não só leitura do diff.
6. **Se houver Crítico ou Importante:** rodada de correção (máximo 5). Retome o mesmo implementador — ele ainda tem o contexto. Depois, re-revisão **escopada** só ao diff da correção.
7. **Registre no ledger** cada rodada e a conclusão, com os hashes.
8. **Mova a issue do Linear** para Done.

Menores vão para o ledger como deferidos, não entram em loop.

---

## 6. Ambiente

- **Windows 11.** PowerShell é o shell padrão; Git Bash também existe. Não misture sintaxe.
- **Docker não está no PATH.** Antes de qualquer comando `supabase` ou `docker`:
  `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"` (Git Bash).
- **Docker Desktop 4.91.0** com engine no ar (Server 29.8.0). WSL 2.7.14.
- **Stack Supabase local** já inicializada. `npx supabase db reset` aplica todas as migrations e o seed.
- **`.env.test`** existe no disco, em UTF-8 sem BOM, com as chaves `DB_URL`, `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`. **Nunca commitado** — confirme `git ls-files | grep -i env` vazio antes de cada commit.
- **Banco direto:** `docker exec supabase_db_Empreeteira_Pedro psql -U postgres -c "..."`.
- **Testes:** `npm test`. Aviso do Vite sobre sintaxe ESM em `vitest.config.ts` é cosmético.
- `supabase_vector` fica em restart loop e `imgproxy`/`pooler` não sobem. É o default da CLI, **não conserte**.

---

## 7. Barra de qualidade estabelecida

As revisões anteriores cobraram e vale manter:

- **Controle negativo em todo teste de isolamento.** Provar que o usuário vê o que deve **e** que existe algo que ele não vê. Um teste que passa porque a query voltou vazia por engano é pior que nenhum teste.
- **Verificação de mutação.** Quebre a regra de propósito, veja quais testes pegam, restaure com `npx supabase db reset`, e relate quais detectaram. Se um teste crítico não detectar, ele não testa o que deveria.
- **Assertivas específicas.** Regex frouxo (`/16/`) casa com qualquer erro que contenha o dígito. Prefira `/maximo permitido e 16/`.
- **Defeitos no plano devem ser corrigidos e documentados, não silenciados.** Três foram encontrados até aqui e todos eram erros reais do plano. O comportamento certo é: rodar, confirmar qual é o valor correto, corrigir o mínimo, registrar no relatório.

---

## 8. Constraints globais

- Migrations em `supabase/migrations/`, `NNN_descricao.sql`. **Nunca editar migration já commitada** — criar outra. A próxima livre é a `008`.
- Toda tabela de negócio carrega `company_id` e tem RLS habilitada **com ao menos uma policy**.
- Quantidade e dinheiro **sempre `numeric(14,4)`**, nunca float.
- Nada derivável é armazenado — saldo e totais são sempre calculados.
- `qty_requested` nunca sofre UPDATE depois do envio; o ajuste do aprovador vai em `qty_approved`.
- Identificadores em inglês; mensagens de `raise exception` em **português** (chegam na tela do empreiteiro).
- Mensagens de erro de saldo informam **o máximo permitido**, não apenas recusam.
- Commits em português com prefixo convencional (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).

**Restrição do usuário:** a conta Netlify conectada por MCP nesta máquina é **proibida** neste projeto. O deploy vai para outra conta, via CLI com `NETLIFY_AUTH_TOKEN`. Confirmar com o usuário antes do primeiro deploy.

---

## 9. Achados deferidos — a revisão final da branch precisa triar

| Origem | Achado | Nota |
|---|---|---|
| Task 2 (parked) | `isLocalUrl()` usa `String.includes`, então `localhost.evil.com` dribla a trava do `cleanup()` | Real, não-bloqueante. A falha realista (URL de produção colada) o `includes` pega. Conserto: parsear a URL e comparar `hostname`. Um arquivo só. |
| Task 2 | Constante de módulo `URL` em `auth.ts:7` sombreia a classe global | Confunde quem ler |
| Task 2 | `isLocalUrl` não reconhece `::1` nem maiúsculas | Só bloqueia de mais, sem risco |
| Task 2 | Nenhuma policy de INSERT/UPDATE/DELETE em nenhuma tabela | **Limite de escopo deliberado do Plano 1.** Todo write passa por `service_role`. As policies de escrita entram no Plano 2, com as telas. Não é defeito. |
| Task 1 | `package.json` name difere do nome da pasta | Exigência do npm |
| Task 4 | `auth_contractor_ids()` ficou sem consumidor após a migration 004 | Código morto; avaliar remoção |
| Task 6 | `contract_item_balance()` retorna NULL para item inexistente, e o `if` não dispara | Inalcançável pela FK. Nit defensivo. |
| Task 5 | `measurement_items` não valida cross-contract no schema | Foi fechado por trigger na correção da Task 6; avaliar se merece constraint |

---

## 10. Linear

Projeto: **Plataforma de Medição de Empreiteiros**, time Gustavo (`GUS`).
https://linear.app/gustavo0/project/plataforma-de-medicao-de-empreiteiros-f8401247dfa6

| Task | Issue | Estado |
|---|---|---|
| 1 | GUS-28 | Done |
| 2 | GUS-29 | Done |
| 3 | GUS-30 | Done |
| 4 | GUS-31 | Done |
| 5 | GUS-32 | Done |
| 6 | GUS-33 | **In Progress** (esperando a re-revisão) |
| 7 | GUS-34 | Backlog |
| 8 | GUS-35 | Backlog |
| 9 | GUS-36 | Backlog |
| 10 | GUS-37 | Backlog |
| 11 | GUS-38 | Backlog |

---

## 11. Depois das 11 tarefas

Revisão final da branch inteira (`git diff 80379fd..HEAD`), em modelo capaz, apontando para a seção 9 deste documento para triar o que precisa entrar antes do merge. Se houver achados, **uma** rodada de correção com a lista completa — não um agente por achado.

Depois disso vêm o Plano 2 (área do empreiteiro, 7 telas mobile) e o Plano 3 (área da construtora, 5 telas desktop), que ainda não foram escritos.
