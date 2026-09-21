# Briefing visual — Plataforma de Medição de Empreiteiros

**Para:** o agente que vai cuidar do visual e da experiência.
**De:** quem construiu a lógica e as telas funcionais.
**Data:** 2026-09-21

O produto está **funcionalmente completo e testado**. O que falta é design. Este documento diz o que ele é, quem usa, o que não pode quebrar e onde estão as fraquezas visuais que eu já enxergo.

---

## 1. O que é o produto

Em obras de construção civil, todo mês o empreiteiro precisa apresentar sua medição — quanto de cada serviço executou. Hoje cada um faz de um jeito: Excel, WhatsApp, PDF, ou simplesmente não faz, e a engenharia monta a planilha em nome dele.

Este sistema padroniza esse ciclo:

```
Contrato → Medição → Aprovação → Liberação para NF → Envio da NF → Pagamento
```

**Não é um ERP.** Não tem financeiro completo, estoque, compras nem RH. Resolve uma dor só, e resolve bem.

---

## 2. Quem usa, e essa é a parte que mais importa

São dois públicos com necessidades opostas, e o sistema serve os dois no mesmo código.

### O empreiteiro — celular, na obra

É o usuário mais importante e o menos familiarizado com software. Pode ser um mestre de obras de 50 anos, de bota, no sol, com o celular na mão e 4G ruim. Talvez use o aparelho basicamente para WhatsApp.

A régua do produto, escrita no documento original de requisitos:

> "Se uma pessoa que sabe usar WhatsApp não consegue usar o sistema, a interface está complicada demais."

O que isso exige na prática: botões grandes, pouco texto, fonte legível, poucos campos por tela, nenhuma tabela larga, nenhum menu escondido. Ele abre o app umas duas vezes por mês — não vai aprender atalhos nem decorar ícones.

**Detalhe técnico que vira decisão visual:** campos de entrada precisam de fonte de no mínimo 16px. Abaixo disso o Safari do iPhone dá zoom automático ao focar o campo, e a pessoa se perde na tela. Isso já está aplicado; por favor não reduza.

### A construtora — desktop, no escritório

Engenharia, coordenação, gerência e financeiro. Gente acostumada com sistema administrativo, que aguenta e prefere tabela, filtro e muita informação simultânea. Aqui densidade é qualidade, não defeito.

---

## 3. Estado visual atual — honestamente

**Tailwind 4, sem nada por cima.** O `globals.css` tem uma linha: `@import "tailwindcss"`. Não há design system, biblioteca de componentes, ícones nem fonte customizada instalados.

O visual foi feito por quem estava resolvendo a lógica, e isso aparece:

- **Paleta:** `slate` para tudo, `emerald` para positivo, `amber` para atenção, `rose` para erro. Escolhida por ser o padrão do Tailwind, não por decisão de marca.
- **Tipografia:** a fonte padrão do sistema. Nunca foi escolhida.
- **Ícones:** SVGs inline, copiados caso a caso. Não há conjunto coerente. Em `src/app/notificacoes/page.tsx` cheguei a usar **caracteres de texto** (`↗`, `✓`, `$`) como ícone — funciona, mas é gambiarra visível.
- **Componentização:** quase nenhuma. Só `Dinheiro.tsx` e `TrilhaStatus.tsx` são reutilizáveis. Cartões, botões, etiquetas e modais foram reescritos em cada tela, com classes ligeiramente diferentes. **Aqui está o maior ganho possível.**
- **Sem modo escuro**, sem estados de carregamento (`loading.tsx`), sem páginas de erro customizadas.
- **Sem identidade.** O produto não tem nome definido, logo nem cor própria. Nos mockups originais apareceu "Medição Fácil — Obras no ritmo certo", mas isso nunca foi decidido.

São 5.193 linhas de TSX em 39 arquivos.

---

## 4. As telas

### Área do empreiteiro (celular)

| Rota | O que é | Observação de design |
|---|---|---|
| `/entrar` | Login por e-mail e senha | Primeira impressão do produto. Hoje é espartana. |
| `/` | Home: valores do contrato, trilha de status, três botões | A tela mais vista. A trilha de bolinhas é o elemento novo mais visual. |
| `/medicao` | Lista de etapas e locais, com busca e progresso | 20 casas hoje; numa obra real são 200. Rolagem longa. |
| `/medicao/local/[unitId]` | **A tela mais importante do produto** | É onde ele digita. Cada serviço tem quantidade, saldo ao vivo, alternador m²/%, e uma seção recolhida de observação e foto. |
| `/medicao/revisao` | Resumo antes do envio, com confirmação | Momento de compromisso. Precisa transmitir seriedade. |
| `/medicoes` | Histórico com status e valores | |
| `/medicoes/[id]/nf` | Envio da nota fiscal, com upload de PDF | |
| `/medicoes/[id]/espelho` | Folha oficial da medição, para impressão | Tem `print:` no Tailwind. Pensada para A4. |
| `/contrato` | Totais por serviço e detalhe por local, recolhido | |
| `/contrato/folha` | Folha do contrato, para impressão | Também A4. |
| `/notificacoes` | Avisos | Onde estão os ícones de texto improvisados. |

### Área da construtora (desktop)

| Rota | O que é |
|---|---|
| `/analise` | Painel de medições recebidas, com abas e busca |
| `/analise/[id]` | Conferência: ajusta quantidade item a item, vê fotos, linha do tempo de auditoria, aprova, devolve ou cancela |
| `/analise/prazos` | Quem enviou e quem não enviou; reabertura de prazo por empreiteiro |
| `/faturamento` | Notas fiscais por status: conferir, aprovar, rejeitar, marcar paga |

---

## 5. O que **não** pode ser quebrado

Isto não é preciosismo — são coisas que já custaram caro para acertar.

**Os 267 testes precisam continuar passando.** Rode `npm test` antes e depois. Vários testes de interface localizam elementos por **texto visível** (`getByRole('button', { name: 'Entrar' })`) e por `data-testid`. Se você mudar o texto de um botão ou remover um `data-testid`, o teste quebra — e o teste está certo, o texto é contrato.

Os `data-testid` existentes, todos eles:

| Fixos | Com sufixo de id |
|---|---|
| `trilha-status` | `linha-servico-{id}` |
| `resumo-por-servico` | `evidencia-{id}` |
| `botao-detalhe-por-local` | `item-analise-{id}` |
| `link-folha-contrato` | `medicao-card-{id}` |
| `evidencias-recebidas` | `card-medicao-{id}` |
| | `card-faturamento-{id}` |
| | `prazo-{id}` |

Pode acrescentar `data-testid` à vontade. Só não remova nem renomeie os que estão acima sem rodar a suíte.

**Não mexa em lógica de negócio.** Cálculo de saldo, conversão m²/%, permissões e transições de status vivem no banco, não no React. Se uma tela parece precisar de uma conta nova, provavelmente a conta já existe numa função SQL — procure antes de calcular no cliente.

**Não filtre dados por usuário no código.** O isolamento entre construtoras e entre empreiteiros é feito por Row Level Security no Postgres. Nenhuma consulta em `src/` filtra por `company_id` ou `contractor_id`, e isso é proposital.

**Não use a chave de service role no frontend.** Ela ignora todas as regras de segurança.

**Mensagens de erro em português**, e informando o que fazer. A de saldo, por exemplo, diz o máximo permitido em vez de só recusar — o empreiteiro está na obra e precisa saber quanto pode medir.

---

## 6. Onde eu investiria, se fosse fazer o visual

Em ordem de retorno:

**1. Extrair um sistema de componentes.** Cartão, botão (primário, secundário, perigo), etiqueta de status, campo de formulário, modal. Hoje cada tela reimplementa com classes ligeiramente diferentes, e isso aparece: dois cartões lado a lado têm sombras diferentes. É o maior ganho pelo menor esforço.

**2. Escolher um conjunto de ícones.** Trocar os SVGs avulsos e os caracteres de texto por algo coerente. `lucide-react` resolveria.

**3. Tipografia e identidade.** Escolher uma fonte, uma cor de marca e um nome. Hoje o produto não parece um produto — parece um protótipo funcional, que é exatamente o que é.

**4. A tela de preenchimento (`/medicao/local/[unitId]`).** É onde o empreiteiro passa o tempo dele. Cada serviço é um cartão com muita informação: total, medido antes, saldo, campo, alternador, subtotal, observação, foto. Funciona, mas está apertada. Se uma tela merece atenção desproporcional, é essa.

**5. Estados vazios, de carregamento e de erro.** Hoje não existem `loading.tsx` nem `error.tsx`. A navegação entre páginas do servidor dá uma sensação de travamento.

**6. As folhas de impressão.** `/contrato/folha` e `/medicoes/[id]/espelho` são documentos que vão para reunião e para assinatura. Merecem parecer documento formal, não página web impressa.

---

## 7. Como rodar

```bash
# 1. Docker Desktop precisa estar rodando.
#    No Git Bash, o binário não está no PATH:
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

# 2. Banco local com dados de demonstração
npx supabase start
npx supabase db reset      # aplica as migrations e o seed

# 3. Aplicação
npm run dev                # desenvolvimento
# ou
npm run build && npm start # produção

# 4. Testes
npm test                   # suíte principal (267)
npm run test:seed          # dados de demonstração (12)
npm run e2e                # Playwright, em perfil de celular
```

**Contas de demonstração** (senha `demo1234` em todas):

| Perfil | E-mail | Onde testar |
|---|---|---|
| Empreiteiro Alfa | `alfa@demo.test` | Celular |
| Empreiteiro Beta | `beta@demo.test` | Celular — serve para conferir que um não vê os dados do outro |
| Engenharia | `engenharia@demo.test` | Desktop |
| Gerência / Financeiro | `gerencia@demo.test` | Desktop |

Os dados: uma construtora, obra "Residencial Vista Alta" com 20 casas, dois empreiteiros, quatro competências de histórico e o período corrente aberto.

**Detalhe útil:** rodar `npm test` não apaga mais os dados de demonstração. Isso já quebrou a demo duas vezes e foi corrigido — a limpeza dos testes preserva o que está marcado como demonstração.

---

## 8. Referência visual existente

Existem dois mockups que o idealizador do produto aprovou, descritos na seção 11 do spec (`docs/superpowers/specs/2026-09-21-medicao-empreiteiros-design.md`). Eles definiram a estrutura das telas, e as telas atuais seguem essa estrutura — o que falta é acabamento.

Vale ler também a seção 10 do spec: ela registra o que o especialista de domínio confirmou sobre como a medição funciona de verdade em obra. Entender isso ajuda a decidir o que merece destaque na tela.

---

## 9. Uma coisa que eu pediria

Antes de redesenhar, **use o produto como o empreiteiro usaria**: abra no celular, entre como `alfa@demo.test`, e faça uma medição inteira até enviar. Depois entre como `engenharia@demo.test` no desktop e confira essa mesma medição.

Dez minutos fazendo isso valem mais que ler este documento inteiro.
