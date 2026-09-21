# Plataforma de Medição de Empreiteiros — Design

**Data:** 2026-09-21
**Status:** Design aprovado, aguardando validação de domínio com o Pedro
**Autores:** Gustavo (implementação) · Pedro (origem da ideia e conhecimento do domínio)

---

## 1. Contexto

Em obras de construção civil, cada empreiteiro apresenta sua medição mensal de um jeito diferente: Excel, WhatsApp, PDF, ou simplesmente não faz — obrigando a equipe de engenharia a montar a planilha em nome dele. O processo de aprovação depois disso é informal e não deixa rastro.

Este produto resolve **uma** dor: padronizar e simplificar a medição entre empreiteiro e construtora.

**Ciclo completo:** Contrato → Medição → Aprovação → Liberação para NF → Envio da NF → Histórico

## 2. Não-objetivos

O sistema **não** é um ERP. Não terá financeiro completo, estoque, compras, RH, contabilidade, planejamento ou orçamento. Toda funcionalidade proposta deve responder "isso serve ao ciclo de medição?" — se não, fica fora.

## 3. Posicionamento atual

**Produto antes de cliente.** Não existe construtora piloto. O MVP é otimizado para ser **demonstrável**: o ciclo completo funcionando sobre dados de exemplo, não a absorção de dados reais em volume.

Consequência prática: import de planilha de contrato — obrigatório com cliente real, por causa do volume (~3.000 itens numa obra de 200 locais) — fica para depois da primeira venda. O cadastro no MVP é feito por seed.

O import é o **primeiro item depois do MVP**, e precisa ser flexível: o contrato do empreiteiro nasce da planilha do ERP da construtora, que pode ser Sienge, TOTVS ou SAP. A estrutura de origem varia; a estrutura de medição, não.

**Desalinhamento comprador/usuário a ter em mente:** quem paga é a construtora, quem precisa amar o produto é o empreiteiro. O argumento de venda não é "seu empreiteiro vai adorar", é "seus engenheiros param de montar planilha alheia".

---

## 4. Decisões de arquitetura

### 4.1 Stack

- **Next.js** (App Router) — uma aplicação, duas áreas: empreiteiro (mobile-first) e construtora (desktop).
- **Supabase** — Auth, Postgres, Storage, RLS.
- **Deploy:** Netlify, via CLI com `NETLIFY_AUTH_TOKEN`. **Restrição:** a conta Netlify conectada por MCP nesta máquina é proibida; o deploy vai para outra conta, a confirmar antes do primeiro deploy.

### 4.2 Isolamento de dados

Toda tabela carrega `company_id`. O isolamento é feito por **Row Level Security do Postgres**, não por filtro na aplicação. Com RLS, esquecer um filtro numa query retorna zero linhas em vez de vazar dados de outra construtora.

Segunda camada: o empreiteiro tem política adicional restringindo ao próprio `contractor_id`.

### 4.3 Regras críticas moram no banco

A validação de saldo **não pode existir só no React** — o cliente roda no celular do empreiteiro e pode ser contornado. Saldo, cálculo de subtotal e transição de status vivem em funções Postgres e constraints. O frontend replica a validação apenas para feedback ao vivo.

Efeito colateral desejado: os valores nunca divergem entre a tela do empreiteiro e a da engenharia, porque são calculados no mesmo lugar.

### 4.4 Arquivos

Storage do Supabase, um bucket por tipo (fotos de medição, notas fiscais, documentos de contrato), com `company_id` no caminho para a RLS valer. Fotos comprimidas no navegador antes do upload — foto de obra em celular moderno chega a 8 MB e o empreiteiro está no 4G da obra.

---

## 5. Modelo de domínio

### 5.1 Decisões estruturais

**(a) Saldo nunca é armazenado — é sempre calculado.**

```
saldo = quantidade_contratada
      − soma(quantidades aprovadas em medições aprovadas)
      − soma(quantidades solicitadas em medições em análise)
```

O valor em análise entra no cálculo, senão o empreiteiro mede 46 m², envia, e mede os mesmos 46 m² de novo antes da primeira ser aprovada. Guardar saldo como coluna é a origem clássica de divergência quando uma medição é devolvida ou um período reaberto.

**(b) `quantidade_solicitada` é imutável; `quantidade_aprovada` é coluna separada.**

A aprovada nasce nula e é preenchida pela engenharia. Nenhum update jamais toca a solicitada. É isso que torna a auditoria possível sem esforço extra.

**(c) Aditivo nunca altera item existente — sempre cria itens novos.**

Se um aditivo aumenta o contrapiso da Casa 07, entra nova linha vinculada ao aditivo, com quantidade e preço próprios. Medições antigas continuam apontando para o item antigo com o saldo original. Histórico intacto, sem versionamento de linha.

**(d) Percentual é modo de entrada, não unidade.** *(confirmado pelo Pedro em 2026-09-21)*

A porcentagem é sempre relativa à quantidade **do local**, nunca ao contrato inteiro. Se o contrato tem 2.000 m² de alvenaria mas o pavimento tem 200 m², medir 10% é medir 20 m² — não 200.

Portanto o item de contrato guarda sempre quantidade e unidade reais (200 m²) mais o preço unitário. O `%` é apenas outra forma de digitar o mesmo número: o empreiteiro escolhe entre "20 m²" e "10%", e o sistema converte na entrada. **O valor armazenado é sempre a quantidade.**

Consequência: a regra de saldo, o cálculo e a auditoria operam sempre na unidade física, sem caso especial. O modo de entrada padrão é configuração da construtora, porque varia de uma para outra.

Exceção minoritária: itens sem quantidade física (mobilização, verba) usam `quantidade = 100`, `preço = valor/100`, `unidade = %` — aí o percentual é a unidade de fato.

**(e) `contract_items.unit_id` é opcional.**

Contrato com casas → navegação obra → etapa → casa → serviços. Contrato de empreitada global → a tela pula etapa e casa e vai direto aos serviços. Mesmo modelo, mesma regra de saldo, profundidade de navegação diferente.

### 5.2 Entidades

Em ordem de dependência:

```
companies
  └─ users + memberships        (um usuário, N vínculos; escopo por empresa OU por obra.
                                 Cobre o empreiteiro que atende 2 construtoras e o aprovador
                                 externo da incorporadora, que enxerga só uma obra)
  └─ projects                   (obras)
       └─ contractors           (empreiteiros)
       └─ contracts
            └─ contract_addendums
            └─ stages           (etapas — nome configurável)
            └─ unit_types       (tipologias — cadastra uma vez, replica nos locais)
                 └─ units       (locais: casa, apartamento ou pavimento — rótulo configurável por obra)
            └─ contract_items   (serviço, quantidade, preço, unidade; unit_id opcional)
       └─ measurement_periods
            └─ measurements
                 └─ measurement_items
                 └─ approvals
                 └─ attachments
                 └─ invoices
  └─ audit_log
  └─ period_reopenings
```

**Fora da fatia vertical:** `service_categories` (o agrupamento visual pode ser campo texto no item), glosas, notificações por e-mail, `unit_types` como tela de cadastro.

---

## 6. Máquina de estados

O spec original lista 15 status. Usamos **8**, separando `status` de `nível_atual`.

```
RASCUNHO → EM_ANALISE (nível 1..N) → APROVADA → NF_ENVIADA → NF_APROVADA → PAGA
                 ↓ ↑
             DEVOLVIDA            (CANCELADA a partir de qualquer ponto)
```

**Por que separar nível de status:** "Aguardando coordenação" e "Aguardando gerência" como status fariam com que adicionar um nível de aprovação exigisse mexer no código — exatamente o que o requisito de fluxo configurável proíbe. Como rótulo derivado de `status = EM_ANALISE` + `nível_atual = 3`, configurar uma obra com dois níveis não toca em código.

"Aprovada" e "Liberada para faturamento" foram unificadas: uma implica a outra imediatamente.

### 6.1 Transições

| Ator | Transição |
|---|---|
| Empreiteiro | `RASCUNHO → EM_ANALISE`, `DEVOLVIDA → EM_ANALISE`, `APROVADA → NF_ENVIADA` |
| Aprovador nível N | avança para N+1, ou `APROVADA` se último; ou `DEVOLVIDA` com motivo obrigatório |
| Financeiro | `NF_ENVIADA → NF_APROVADA → PAGA` |
| Admin | `CANCELADA` a partir de qualquer estado, com motivo |

### 6.2 Regras de fluxo

- **Devolução volta para o nível 1.** Se a gerência devolve, o fluxo recomeça na engenharia. Quem devolveu detectou um sintoma; quem confere quantidade é a engenharia.
- **Reabertura de período é por empreiteiro, não por obra.** Alterar a data de fechamento reabriria para todos os empreiteiros da obra. Vira registro próprio em `period_reopenings`: quem foi reaberto, por quem, até quando, por quê.
- **Reabertura não ressuscita medição aprovada.** Só afeta `RASCUNHO` e `DEVOLVIDA`. Corrigir algo aprovado exige cancelar e refazer, com rastro.
- **Protocolo gerado no envio, nunca reutilizado.** Formato `MED-2026-09-005`, sequencial por obra e competência. Medição cancelada leva o número com ela.
- **Cada nível pode ajustar a quantidade aprovada, para mais ou para menos.** *(confirmado pelo Pedro)* O aprovador frequentemente rebalanceia — tira quantidade de um serviço e coloca em outro. O aumento continua limitado pelo saldo daquele item de contrato. A coordenação pode alterar o que a engenharia aprovou. Cada ajuste grava autor, nível, valor anterior, valor novo e data; a tela de histórico é montada dessa tabela.
- **A cadeia de aprovação típica tem 3 a 4 níveis:** Engenharia → Coordenação → Gerência → Incorporadora. O último é um aprovador **externo à construtora** e nem toda obra o tem. É atendido por `membership` escopada à obra: ele enxerga aquela obra e nada mais da construtora.
- **A aprovação final notifica o empreiteiro.** O ciclo só fecha quando ele sabe que pode faturar.

---

## 7. Escopo do MVP — fatia vertical fina

Uma construtora, uma obra, um contrato, um empreiteiro, um período. O ciclo inteiro funcionando de verdade.

### 7.1 Telas do empreiteiro (mobile-first)

1. **Login** — e-mail + senha (ver premissa P5).
2. **Home / Meu contrato** — valor contratado, já aprovado, em aprovação, saldo a medir; período atual e prazo; três botões (nova medição, medições anteriores, meu contrato).
3. **Nova medição** — etapa → lista de locais com progresso e busca → serviços do local.
4. **Preenchimento de serviços** — por linha: quantidade total, medido anteriormente, campo de medição atual, saldo atualizando ao vivo, valor. Alternador metragem ⇄ percentual no campo de entrada, convertendo sobre a quantidade **do local**. Total do local no rodapé. Salvar rascunho / revisar e enviar.
5. **Revisão e envio** — resumo por local e serviço, total, anexos, confirmação com aviso de bloqueio.
6. **Minhas medições** — histórico com status e valores; detalhe de cada uma.
7. **Envio de NF** — número, data, valor, upload de PDF/XML.

### 7.2 Telas da construtora (desktop)

1. **Login.**
2. **Medições recebidas** — abas por status, filtros por obra/período/empreiteiro, tabela.
3. **Análise e aprovação** — solicitado vs. aprovado lado a lado, ajuste por item **para mais ou para menos** (limitado pelo saldo do item), observações do empreiteiro, fotos, total recalculado ao vivo; devolver (motivo obrigatório) / aprovar / salvar parcial.
4. **Histórico da medição** — linha do tempo de auditoria.
5. **Faturamento** — medições liberadas, NF recebida, aprovar/rejeitar, marcar paga.

### 7.3 Cadastro e configuração

Via script de seed. Sem telas de admin no MVP.

Isso vale também para toda a **configuração** que o modelo prevê: número de níveis de aprovação (definido **por obra**; o seed usa três — Engenharia → Coordenação → Gerência), rótulo do local (casa, apartamento ou pavimento), modo de entrada padrão (metragem ou percentual), regra de bloqueio quando o valor da NF diverge do aprovado, e nomes das etapas. As tabelas existem e o código as lê; quem escreve os valores é o seed. `contract_addendums` segue a mesma regra — a tabela existe para que o modelo não precise ser refeito depois, mas não há interface de aditivo no MVP.

Cancelamento de medição existe na máquina de estados e é exercido por teste, mas não tem botão no MVP.

### 7.4 Explicitamente fora do MVP

Import de planilha, notificações por e-mail e WhatsApp, dashboards, glosas, aditivos com interface, telas de admin, relatórios, assinatura digital, leitura automática de XML, app nativo, medição offline.

---

## 8. Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Quantidade acima do saldo | Bloqueio com mensagem indicando o máximo permitido. Feedback ao vivo na coluna de saldo, antes do envio. |
| Período fecha durante o preenchimento | A medição vira somente leitura, com aviso claro. Rascunho preservado. |
| Duas abas editando o mesmo rascunho | Lock otimista por versão; a segunda gravação avisa em vez de sobrescrever. |
| Upload falha no 4G | Retry automático; a medição salva sem a foto e sinaliza o anexo pendente. |
| Dois aprovadores do mesmo nível abrem juntos | Lock otimista; o segundo recebe aviso de que a medição já avançou. |
| NF com valor diferente do aprovado | Alerta sempre; bloqueio conforme configuração da obra. |
| Medição sem nenhum item preenchido | Envio bloqueado. |
| Empreiteiro tenta acessar contrato de outro | RLS retorna vazio; a aplicação mostra "não encontrado", nunca "sem permissão" (não confirma existência). |

---

## 9. Testes

**Prioridade — as regras que, se quebrarem, custam dinheiro de verdade:**

1. **Regra de saldo**, no banco: inclui medições em análise no cálculo; rejeita quantidade acima do saldo; comporta-se corretamente após devolução e após cancelamento.
2. **RLS**, como teste de segurança explícito: empreiteiro A não lê dados de B; construtora A não lê nada de B; verificado por consulta direta ao banco com o JWT de cada papel.
3. **Transições de estado**: toda transição inválida é rejeitada pelo banco, não só escondida na interface.
4. **Cálculo e conversão**: quantidade × preço unitário; conversão percentual ⇄ metragem sempre sobre a quantidade **do local** (10% de um pavimento de 200 m² são 20 m², nunca 10% dos 2.000 m² do contrato); totais por local e por medição.
5. **Ajuste para mais**: o aprovador consegue aumentar a quantidade; o aumento é rejeitado quando ultrapassa o saldo daquele item de contrato.
6. **Auditoria**: todo ajuste grava valor anterior, valor novo, autor, nível e data; a quantidade solicitada permanece intacta após múltiplos ajustes.
7. **E2E do ciclo completo**: rascunho → envio → ajuste da engenharia → aprovação da coordenação → aprovação da gerência → NF → paga.

---

## 10. Premissas

Decisões tomadas por falta de acesso ao especialista de domínio. Todas são **decisões de implementação, não verdades do negócio** — devem ser confirmadas com o Pedro.

### 10.1 Premissas em aberto

| # | Premissa | Custo de reverter |
|---|---|---|
| ~~P1~~ | **Confirmado** — ver 10.2. | — |
| ~~P2~~ | **Corrigido** — ver 10.2. | — |
| ~~P3~~ | **Corrigido** — ver 10.2. | — |
| **P4** | Devolução retorna ao nível 1. | **Baixo** |
| **P5** | Login por e-mail e senha no MVP. Telefone + OTP é melhor para este público (empreiteiro esquece senha e trava na recuperação por e-mail), mas adiciona custo e dependência de SMS; fica para depois da validação. | **Baixo** |
| **P6** | Glosa, quando implementada, será no nível do item, não da medição. | **Baixo** — ainda não implementada. |
| **P7** | Notificações apenas in-app no MVP. WhatsApp exige aprovação de template na API da Meta e tem custo por conversa. | **Baixo** |

### 10.2 Respostas do Pedro — 2026-09-21

O que deixou de ser premissa e virou fato do negócio:

**A estrutura de medição é padrão, independente do ERP de origem.** O contrato do empreiteiro nasce da planilha do sistema da construtora — Sienge, TOTVS ou SAP, varia — mas o fluxo de medição é sempre o mesmo: selecionar o local → ver os serviços daquele local → cada serviço já traz o que foi medido e o que falta medir → o empreiteiro preenche por metragem ou por percentual.

**O "local" é genérico.** Casa, apartamento ou pavimento, conforme a obra. Entidade única com rótulo configurável.

**A medição é sempre relativa ao local, nunca ao contrato inteiro.** Esta é a correção mais importante. Contrato com 2.000 m² de alvenaria, pavimento com 200 m²: medir 10% são 20 m². Foi o que reescreveu a decisão 5.1(d) — percentual passou de unidade a modo de entrada.

**O aprovador pode aumentar a quantidade, não só reduzir.** Motivo: rebalanceamento entre serviços — tira de um, põe em outro. Limitado pelo saldo do item.

**A cadeia típica é Engenharia → Coordenação → Gerência → Incorporadora**, variando para mais ou menos, com retorno ao empreiteiro quando aprovada. A incorporadora é externa à construtora e nem sempre participa.

### 10.3 Validação do mockup

A "foto da estrutura padrão" que o Pedro citou é o mockup detalhado de "Nova medição" já fornecido. Ele é, segundo o Pedro, o padrão do mercado — não apenas uma proposta de layout. A descrição dele mapeia integralmente na tela: selecionar o local (passos 1–3), ver os serviços do local (passo 4), com o já medido e o saldo visíveis por linha.

**Única divergência:** o mockup aceita somente quantidade. Falta o alternador metragem ⇄ percentual que o Pedro descreveu. Resolução adotada: o modo padrão vem da configuração da construtora — é escolha dela, não do empreiteiro — com alternador por linha para o caso de um serviço específico ser digitado de outra forma.

### 10.4 Ainda pendente

- Nenhum bloqueio de domínio conhecido. As pendências restantes são de configuração e aparecerão quando o Pedro vir o painel rodando.

---

## 11. Referências do material original

O spec de origem e os dois mockups fornecidos. Observações registradas na revisão:

- A aritmética do painel "Meu Contrato" confirma a regra de saldo: contratado R$ 850.000 = aprovado R$ 410.000 + em aprovação R$ 30.000 + saldo R$ 410.000.
- O mockup detalhado traz "Tipologia padrão – 70,00 m²", confirmando a necessidade de `unit_types`.
- O total da tela de medição do mockup está somado errado (R$ 6.065 onde a soma das linhas dá R$ 8.065). Não é defeito do mockup — é a tese do produto se provando: quem desenhou a tela com calma errou uma soma de seis linhas.
