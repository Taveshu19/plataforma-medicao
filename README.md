# Plataforma de Medição de Empreiteiros

Sistema web que padroniza a medição mensal entre construtora e empreiteiro. Hoje cada empreiteiro apresenta a medição de um jeito (Excel, WhatsApp, PDF) e a engenharia acaba montando a planilha por ele. Aqui o ciclo inteiro fica num lugar só:

**Contrato → Medição → Aprovação → Nota fiscal → Histórico**

Produto desenvolvido com um profissional da construção civil, que trouxe o conhecimento do domínio. MVP pronto, com dados de demonstração.

## Como funciona

- **Empreiteiro (celular):** vê o contrato e o saldo de cada serviço, lança a medição por local (em m² ou em %), anexa fotos e, depois da aprovação, envia a nota fiscal.
- **Engenharia (desktop):** recebe as medições, ajusta quantidades, devolve com motivo ou aprova, em quantos níveis a obra exigir.
- **Financeiro:** confere a nota contra o valor aprovado e registra o pagamento.
- Tudo fica numa linha do tempo de auditoria e num espelho formal da medição para assinatura.

## Decisões de arquitetura

- **Várias empresas no mesmo sistema, isoladas pelo banco.** Toda tabela carrega `company_id` e o isolamento é feito por Row Level Security do Postgres, não por filtro na aplicação: esquecer um filtro devolve zero linhas, em vez de vazar dados de outra construtora. O empreiteiro tem uma segunda política que o limita aos próprios contratos.
- **As regras críticas moram no banco.** Saldo, subtotal e transições de status são funções Postgres. O app roda no celular do empreiteiro e poderia ser contornado; o front-end só repete a validação para dar retorno na hora.
- **Saldo nunca é guardado, é calculado.** `contratado − aprovado − em análise`. A quantidade em análise entra na conta para o empreiteiro não medir o mesmo serviço duas vezes antes da primeira aprovação.
- **Quantidade solicitada é imutável;** a aprovada é outra coluna. Isso dá a auditoria de graça.
- **Percentual é modo de entrada, não unidade:** o banco guarda sempre a quantidade física.
- **Status separado do nível de aprovação:** 8 status em vez de 15, e adicionar um nível de aprovação não exige mudar código.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Vitest · Playwright · Vercel

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/app/` | Rotas do empreiteiro (`medicao`, `contrato`, `medicoes`), da engenharia (`analise`, `painel`) e do financeiro (`faturamento`) |
| `supabase/migrations/` | 31 migrações: empresas e vínculos, contratos, saldo, máquina de estados, auditoria, reabertura, anexos, faturamento |
| `tests/` | Testes de regra e de fluxo com Vitest (mais de 30 arquivos) |
| `e2e/` | Fluxos completos no navegador com Playwright: login, medição, aprovação, faturamento |
| `docs/superpowers/` | Especificação e planos de implementação, escritos antes do código |

## Rodar localmente

```bash
npm install
npx supabase start      # Postgres local com as migrações
npm run db:reset        # recria o banco com os dados de demonstração
npm run dev
npm test                # testes de regra
npm run e2e             # testes de ponta a ponta
```
