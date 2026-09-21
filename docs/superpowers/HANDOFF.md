# Handoff — Plataforma de Medição de Empreiteiros

**Atualizado em:** 2026-09-21
**Para:** o próximo agente que continuar este projeto.

---

## 1. Leia nesta ordem

1. `docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md` — o que o produto é e por quê. Decisões estruturais na seção 5; premissas e o que o especialista de domínio confirmou na seção 10.
2. `docs/superpowers/plans/2026-09-21-area-empreiteiro-auth-e-home.md` — **o plano em execução agora.** Contém o código e os testes literais de cada tarefa.
3. `docs/superpowers/plans/2026-09-21-fundacao-dados-e-regras.md` — o plano do banco, já concluído. Consulte quando precisar entender uma regra.
4. `.superpowers/sdd/*/progress.md` — os ledgers, um por plano. **Fonte de verdade do progresso**, com o raciocínio de cada decisão. São git-ignored; se sumirem, reconstrua pelo `git log`.

---

## 2. Estado exato

**Branch:** `master`. Árvore limpa. **36 commits.**
**Testes:** 156 na suíte principal + 12 no seed = **168 passando**. 6 testes E2E do Playwright passando em perfil celular real (Pixel 7). `tsc --noEmit` limpo.
**Migrations:** 001 a 017. A próxima livre é a `018`.

### Plano 1 — Fundação de dados e regras: ✅ COMPLETO
12 migrations, RLS de leitura em tudo, regra de saldo, máquina de estados configurável, auditoria, reabertura por empreiteiro, NF com tolerância, seed com obra de 20 casas.

### Plano 2 — Área do empreiteiro (auth e home): ✅ COMPLETO (6 de 6)
Clientes Supabase e proxy de sessão, usuários de demonstração no seed, resumo financeiro do contrato (migration 013), tela de login, home do empreiteiro, suíte E2E de login → home.

### Plano 3 — Fluxo de medição do empreiteiro: ✅ COMPLETO (7 de 7)

| Task | Estado | Commits |
|---|---|---|
| 1 — Policies de escrita RLS e submissão | ✅ completa (migration 014, locks e triggers security definer) | `f517d05` |
| 2 — Consultas de apoio e navegação de locais | ✅ completa (migration 015, helpers tipados de apoio) | `d727a5d` |
| 3 — Conversor metragem ⇄ percentual | ✅ completa (módulo puro e determinístico relativo ao local) | `5452d1b` |
| 4 — Seleção de etapas e locais (`/medicao`) | ✅ completa (agrupamento, busca instantânea e badges) | `3225d7b` |
| 5 — Preenchimento de serviços (`/medicao/local/[unitId]`) | ✅ completa (migration 016, LinhaServico com alternador e Server Action) | `b2c655b` |
| 6 — Revisão e envio formal com protocolo | ✅ completa (`/medicao/revisao`, modal e protocolo sequencial) | `6242614` |
| 7 — Suíte E2E móvel e protocolo resiliente | ✅ completa (migration 017, Playwright Pixel 7 ponta a ponta) | `2ac477b` |

---

## 3. Próximos Passos (Avançar para o Plano 4)

O Plano 3 está 100% concluído, com build verificado, 168 testes automatizados e 6 testes E2E móveis passando.
A próxima ação é planejar o **Plano 4 — Painel de Análise e Aprovação da Engenharia (ou Histórico e Acompanhamento do Empreiteiro)**:
- Fluxo de análise de medições enviadas (`EM_ANALISE`).
- Ajuste de quantidade aprovada (`qty_approved`) pela engenharia (nível 1).
- Devolução de medição com justificativa (`DEVOLVIDA`) vs Avanço no workflow de aprovação (`APROVADA`).
- Histórico de medições anteriores do empreiteiro.


---

## 4. Requisitos que NÃO estão no texto dos planos

Vieram de revisões e se perdem numa passagem descuidada.

### Do Plano 1, para quando o Plano 3 mexer em medições

- **`next_protocol()` não tem lock.** Calcula o sequencial com `count(*) + 1`. Dois envios simultâneos na mesma obra e competência colidem; o `unique` impede duplicata, mas a transação perdedora leva erro `23505` e o empreiteiro precisa reenviar — no dia 10, quando todos correm. Quando a Task de envio de medição for escrita, adicione `pg_advisory_xact_lock` por `(project_id, competence)` dentro de `submit_measurement()`.
- **Duas listas de status precisam andar juntas.** O trigger `enforce_measurement_transition_balance()` (migration 007) tem uma lista interna `v_consuming`, e `contract_item_balance()` (migration 006) tem outra. Qualquer status novo que passe a consumir saldo precisa entrar **nas duas**. Esquecer uma reabre um furo crítico que já custou uma rodada de correção: sem a revalidação na transição, dois rascunhos de 86 m² viravam 172 m² faturáveis num item de 86.
- **Uma medição viva por contrato e período.** `measurements_one_active` é índice único parcial (exclui `CANCELADA`). Testes que criem duas medições para o mesmo contrato precisam de **competências distintas**. Há o helper `createMeasurementInNewPeriod` em `tests/saldo.test.ts` como referência.
- **Não existem policies de escrita.** Toda RLS é de leitura; todo write passa por `service_role`. Isso é limite de escopo deliberado. As policies de escrita entram no Plano 3, junto com as telas que as exercitam.

### Do Plano 2, para todas as tarefas restantes

- **Next.js 16 tem breaking changes.** O arquivo de interceptação é `src/proxy.ts` exportando `proxy()`, **não** `middleware.ts`. `cookies()` de `next/headers` é **assíncrono**. O guia oficial do Supabase para Next.js que circula na internet ensina a convenção antiga e está **errado** para esta versão. A documentação correta está local em `node_modules/next/dist/docs/` — consulte antes de escrever código de framework. O `AGENTS.md` do projeto reforça isso.
- **`setAll` do `@supabase/ssr` recebe dois parâmetros.** O segundo traz os headers de no-cache que a lib exige. Ignorá-lo faz respostas que renovam sessão saírem sem `Cache-Control: no-store` — atrás de CDN, o cookie de um usuário pode ser servido a outro. Já corrigido em `src/proxy.ts`; **não regrida isso** ao mexer no arquivo. TypeScript não acusa, porque função com menos parâmetros é estruturalmente compatível.
- **A autorização é da RLS, nunca da aplicação.** Nada em `src/` deve filtrar por `contractor_id` ou `company_id`. Se uma consulta precisa desse filtro para estar correta, a policy está errada — conserte a policy.
- **`SERVICE_ROLE_KEY` nunca em `src/`.** Ela ignora RLS. Só seed e testes.

---

## 5. Ambiente

- **Windows 11.** PowerShell é o shell padrão; Git Bash também existe.
- **Docker não está no PATH.** Antes de `supabase`/`docker`: `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"` (Git Bash).
- **Docker Desktop 4.91.0** (Server 29.8.0), WSL 2.7.14. Ele já caiu sozinho uma vez no meio da sessão e derrubou 72 testes com `ECONNREFUSED` — se a suíte falhar em massa, cheque o engine antes de procurar bug no código.
- **Stack Supabase local.** `npx supabase start` sobe; `npx supabase db reset` aplica migrations e seed.
- **Arquivos `.env` no Windows:** redirecionamento do PowerShell (`>`) grava UTF-16 e o `dotenv` lê lixo. Escreva à mão em UTF-8 sem BOM.
- `.env.test` (chaves da stack) e `.env.local` (chaves públicas do app) existem no disco e **não** são commitados. Só `.env.example` é rastreado.
- **Testes:** `npm test` (suíte principal), `npm run test:seed` (reset + seed), `npm run test:all` (ambos).
- `supabase_vector` fica em restart loop e `imgproxy`/`pooler` não sobem. É o **default da CLI**, não falha. Não conserte.

---

## 6. Como as tarefas vêm sendo executadas

Um agente implementa a partir de um brief extraído do plano; um segundo revisa o diff com verificação independente no banco; achados Crítico ou Importante viram rodada de correção com re-revisão escopada; tudo vai para o ledger com os hashes.

**Calibragem de custo já decidida:** o Plano 1 era regra que protege dinheiro e revisão em toda tarefa se pagou — achou o furo de saldo e um bug de isolamento entre empresas. O Plano 2 é majoritariamente frontend, onde o custo/benefício inverte: tela errada aparece na hora, regra de saldo errada some no banco. Revisão completa nas tarefas 1 e 3 (segurança e dinheiro); mais leve nas 4, 5 e 6 (UI e E2E), focada em spec e vazamento de dado, não em estética.

**Barra de qualidade estabelecida:** todo teste de isolamento tem controle negativo (provar que vê o que deve **e** que existe algo que não vê); defeitos encontrados nos planos são corrigidos e documentados, nunca silenciados; e correções vêm com evidência de que o teste falha sem elas.

---

## 7. Achados deferidos — a revisão final precisa triar

| Origem | Achado |
|---|---|
| Plano 1 / Task 2 | Constante de módulo `URL` em `tests/helpers/auth.ts` sombreia a classe global |
| Plano 1 / Task 4 | `auth_contractor_ids()` ficou sem consumidor após a migration 004 — código morto |
| Plano 1 / Task 6 | `contract_item_balance()` devolve NULL para item inexistente e o `if` não dispara. Inalcançável pela FK; nit defensivo |
| Plano 1 / Task 5 | `measurement_items` não valida cross-contract no schema — foi fechado por trigger na 007; avaliar se merece constraint |
| Plano 1 / Task 1 | `package.json` name difere do nome da pasta — exigência do npm |

---

## 8. Linear

Projeto: **Plataforma de Medição de Empreiteiros**, time Gustavo (`GUS`).
https://linear.app/gustavo0/project/plataforma-de-medicao-de-empreiteiros-f8401247dfa6

Plano 1: GUS-28 a GUS-38 — todas em Done.
Plano 2: GUS-39 (Done) · GUS-40 (Task 2, **mover para Done se a revisão passar**) · GUS-41 a GUS-44 (Backlog).

---

## 9. Depois do Plano 2

- **Plano 3** — fluxo de medição: policies de escrita, navegação etapa → local → serviços, a tela de preenchimento com alternador metragem ⇄ percentual, revisão e envio. É o coração do produto.
- **Plano 4** — histórico e nota fiscal.
- **Plano 5** — área da construtora: análise, aprovação, faturamento. Fecha o ciclo.

Nenhum deles foi escrito ainda.

---

## 10. Restrição do usuário

**A conta Netlify conectada por MCP nesta máquina é proibida neste projeto.** O deploy vai para outra conta, via CLI com `NETLIFY_AUTH_TOKEN`. Confirme com o usuário qual conta antes do primeiro deploy.
