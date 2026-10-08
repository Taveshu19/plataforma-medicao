# Plataforma de Medição de Empreiteiros

Esse projeto nasceu de uma conversa com o Pedro, que trabalha com obras. Todo mês cada empreiteiro manda a medição de um jeito: planilha, foto no WhatsApp, PDF, ou nem manda, e alguém da engenharia acaba montando a planilha por ele. Depois disso a aprovação acontece por mensagem e não fica registro de nada.

A ideia é simples: um lugar só para o ciclo inteiro.

**Contrato → Medição → Aprovação → Nota fiscal → Histórico**

O Pedro trouxe o conhecimento de obra e eu fiz o sistema. A primeira versão está pronta e roda com dados de demonstração.

## Como funciona na prática

O empreiteiro abre pelo celular, vê o contrato e quanto ainda falta de cada serviço, e lança o que fez no mês, por casa ou pavimento, em m² ou em porcentagem. Pode anexar fotos.

A engenharia recebe no computador, ajusta alguma quantidade se precisar, devolve com o motivo ou aprova. Uma obra pode ter um ou vários níveis de aprovação.

Depois de aprovado, o empreiteiro envia a nota fiscal e o financeiro confere com o valor aprovado e registra o pagamento. Tudo fica numa linha do tempo, e a medição pode ser impressa num espelho formal para assinatura.

## Algumas decisões que tomei

**Cada construtora só enxerga os próprios dados, e quem garante isso é o banco.** Toda tabela tem a empresa dona da linha, e as regras de acesso (Row Level Security do Postgres) filtram tudo. Se algum dia eu esquecer um filtro no código, a consulta volta vazia, em vez de mostrar dados de outra empresa. O empreiteiro tem mais uma regra que o limita aos contratos dele.

**As contas ficam no banco, não na tela.** O app roda no celular do empreiteiro e dá para burlar o que está só no navegador. Saldo, subtotal e mudança de status são funções no Postgres; a tela só repete a validação para avisar na hora.

**O saldo não fica guardado, é sempre calculado:** contratado menos aprovado menos o que está em análise. Se eu não contasse o que está em análise, o empreiteiro poderia medir os mesmos 46 m² duas vezes antes da primeira aprovação.

**A quantidade que o empreiteiro pediu nunca muda.** A que a engenharia aprovou fica em outra coluna. Com isso a auditoria sai de graça.

**Porcentagem é só um jeito de digitar.** O banco guarda sempre a quantidade real (10% de 200 m² vira 20 m²), e as regras não precisam de caso especial.

**Nível de aprovação não é status.** Em vez de um status para cada etapa ("aguardando coordenação", "aguardando gerência"), uso um status "em análise" mais o nível atual. Assim dá para configurar uma obra com dois ou cinco níveis sem mexer no código.

## Tecnologias

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, Storage), Vitest, Playwright e Vercel.

## Onde está cada coisa

| Pasta | O que tem |
|---|---|
| `src/app/` | As telas do empreiteiro (`medicao`, `contrato`, `medicoes`), da engenharia (`analise`, `painel`) e do financeiro (`faturamento`) |
| `supabase/migrations/` | As 31 migrações do banco, na ordem em que o sistema foi crescendo |
| `tests/` | Testes das regras e dos fluxos (Vitest) |
| `e2e/` | Testes no navegador do começo ao fim: login, medição, aprovação e faturamento (Playwright) |
| `docs/superpowers/` | A especificação e os planos, escritos antes do código |

## Para rodar

```bash
npm install
npx supabase start      # sobe o Postgres local com as migrações
npm run db:reset        # recria o banco com os dados de demonstração
npm run dev
npm test                # testes de regra
npm run e2e             # testes de ponta a ponta
```

## Como foi feito

Desenvolvi com agentes de IA (Claude Code e Codex) orquestrados pelo terminal. Cada etapa começou por uma especificação escrita (está em `docs/superpowers/`), virou um plano de tarefas, e cada tarefa foi implementada, testada e revisada antes de seguir. Os arquivos `CLAUDE.md` e `AGENTS.md` são as instruções que os agentes seguem neste projeto.
