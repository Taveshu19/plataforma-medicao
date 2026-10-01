# 2026-10-01 — NF pós-aprovação e Faturamento Direto

Fonte: pedido do Gustavo (texto "Alterações interface empreiteiro"), 01/10/2026.

## O que mudou

**1. NF da medição**
- Status `APROVADA` aparece para o empreiteiro como "Medição aprovada – faturamento liberado" (lista de medições, tela da NF, home).
- Home do empreiteiro mostra aviso com botão "Enviar Nota Fiscal" para cada medição aprovada.
- Formulário da NF: PDF + XML (pelo menos um obrigatório), número, valor, data, observação opcional (`invoices.notes`).
- Regra de banco inalterada: `submit_invoice` só aceita medição `APROVADA` (fim da cadeia Engenharia → Coordenação → Gerência).

**2. Faturamento Direto** (migração `029_faturamento_direto.sql`)
- Tabelas próprias `direct_billings` e `direct_billing_events` (histórico separado do `audit_log` da medição).
- Status: `RASCUNHO, ENVIADO, AGUARDANDO_ENGENHARIA, DEVOLVIDO, APROVADO, PAGO`. Na prática o envio grava evento `ENVIADO` e já deixa `AGUARDANDO_ENGENHARIA`; a tela não tem "salvar rascunho".
- Funções: `submit_direct_billing` (só o empreiteiro do contrato; também reenvia devolvido), `approve_direct_billing` / `return_direct_billing` (só `engenharia`/`admin` da obra; devolução exige justificativa), `pay_direct_billing` (`admin`/`gerencia`/`financeiro`, só após aprovação), `list_direct_billings`, `get_direct_billing`.
- Aprovação da engenharia registra `APROVADO_ENGENHARIA` + `ENVIADO_ADMINISTRATIVO` e avisa empreiteiro e financeiro.
- Telas: `/faturamento-direto` (lista, novo, detalhe/correção), `/analise/faturamento-direto` (engenharia), `/faturamento` com seções separadas e selo "Origem: Medição" / "Origem: Faturamento Direto". `/arquivo?path=` abre PDF/XML por link assinado.

## Evidências
- Banco da nuvem (`caulhutoahdzymwwaibw`): migração aplicada; teste SQL simulando cada usuário, com rollback: Beta não vê nem envia; Gerência não aprova; não paga antes da aprovação; devolução sem motivo bloqueada; histórico completo com nomes.
- `e2e/faturamento-direto.spec.ts` passou contra o build local ligado ao banco da nuvem (envio → devolução → reenvio → aprovação → pagamento). Dados do teste apagados depois (o PDF de teste de 14 bytes ficou no storage).
- `next build` e `tsc` sem erro. `e2e/faturamento.spec.ts` ajustado aos novos textos, não rodado (precisa do banco local/Docker).

## Limites
- Não há vínculo "engenheiro responsável" por obra no banco: vale qualquer usuário `engenharia` com acesso à obra.
- O Administrativo só registra pagamento do Faturamento Direto; não há recusa nessa etapa (não foi pedido).
