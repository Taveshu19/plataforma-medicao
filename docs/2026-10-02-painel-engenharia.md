# 2026-10-02 — Painel da engenharia e trilha do empreiteiro

Fonte: pedido do Gustavo, 02/10/2026.

## O que mudou
1. **Trilha do empreiteiro** (`src/app/trilha.ts`, `src/app/contexto.ts`, home): medição aprovada deixa "Faturamento liberado" verde e "Nota fiscal" como etapa atual ("Envie a nota fiscal desta medição"); NF enviada mostra "em conferência no Administrativo". A home agora mostra uma trilha por medição em andamento (antes só a da competência mais recente, que escondia a medição aprovada esperando NF).
2. **Cards da engenharia** (`/analise`), clicáveis, nesta ordem: Pendentes de enviar medição (X de Y empreiteiros; lista quem não enviou), Aguardando aprovação, Devolvidas, Aprovadas (sem "pagas"; pagamento sumiu da visão da engenharia), Pendentes de emitir NF (aprovadas sem NF, de N aprovadas). Link "Ver todas as medições".
3. **Abas**: engenharia e coordenação veem só Aprovações e Faturamento Direto; "Faturamento e NFs" só para gerência/financeiro/admin. `/faturamento` redireciona a engenharia para `/analise`.

## Regras usadas (decisão de leitura, não regra do cliente)
- Competência atual por obra = período mais recente já aberto (aberto agora ou o último).
- "Enviou" = medição do período fora de rascunho (devolvida conta como enviada; aparece em Devolvidas).
- Sem vínculo engenheiro × empreiteiro no banco: o engenheiro "gerencia" os contratos das obras que acessa.
- NF recusada volta a medição para "Aprovada" e ela reaparece em Pendentes de emitir NF.

## Evidências
- Migração `030_pendentes_envio_medicao.sql` (`get_measurement_submission_status`) aplicada no banco da nuvem; teste com rollback: empreiteiro não vê nada; contrato em rascunho aparece como pendente.
- Testes de unidade (trilha, contexto e outros) 41/41; `next build` ok; telas conferidas no build local ligado ao banco da nuvem.
- E2E antigos ajustados aos novos textos, não rodados (precisam do banco local).

## Atualização 02/10 — tela "Central de Controle" (modelo enviado pelo Pedro)
- `/analise` virou "Central de Controle": sino de avisos, menu do usuário (prazos, avisos, sair), seletor **Medições | Faturamento Direto** (Gerência/Financeiro/Admin veem também "Faturamento e NFs").
- Cards coloridos (Pendentes de envio, Aguardando aprovação, Devolvidas, Aprovadas, Pendentes de NF), "Resumo do mês", filtros em pílula e lista com título e contagem.
- Lista de pendentes com "Não enviada"/"Em rascunho", prazo, botão **Cobrar envio** (avisa o empreiteiro; migração `031_cobrar_envio_medicao.sql`, testada com rollback: engenharia cobra, empreiteiro não) e menu "⋮" com "Ver medições deste empreiteiro".
- Saiu a barra de busca (não está no modelo). A tela abre em "Pendentes" quando há pendência; senão em "Em análise".
