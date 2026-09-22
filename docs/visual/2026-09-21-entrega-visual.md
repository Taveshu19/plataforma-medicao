# Entrega visual — 21/09/2026

Implementação local a partir de `docs/BRIEFING_VISUAL.md` e das seções 10 e 11 do spec. A identidade adotada nesta versão é **Medição Fácil — Obras no ritmo certo**. Prévia compilada em http://127.0.0.1:3000; desenvolvimento em http://127.0.0.1:3001. Não houve publicação externa.

## Direção e implementação

- Verde profundo, fundo de papel e verde claro para a ação principal. Paleta compartilhada no tema Tailwind; estados de atenção e erro continuam distintos.
- Manrope variável servida pelo próprio aplicativo, sem requisição ao Google Fonts. Lucide para a marca, ações, resumo da engenharia, andamento e avisos.
- Entrada com composição gráfica de planta, feita em CSS. No celular, acesso direto ao formulário.
- Início com valores do contrato destacados, ação de medir antes da trilha e composição em duas colunas no desktop.
- Componentes compartilhados: marca, cartão, botão, link de ação, etiqueta e indicador de passos. Aplicados nos principais pontos do fluxo; componentes legados ainda usam utilitários do tema.
- Preenchimento com referências de quantidade separadas, campo de 24 px, controles de unidade maiores, rótulos acessíveis e estado pressionado. Rodapé considera a área segura do celular. Zoom do navegador liberado.
- Engenharia com largura de desktop, resumo a partir das contagens já existentes e abas que quebram linha em telas pequenas.
- Carregamento, erro com nova tentativa (API `retry` desta versão do Next) e página não encontrada.
- Cabeçalho comum nos documentos, regras de A4, repetição de cabeçalho de tabela e prevenção de quebra de linhas na impressão.

Cálculos, consultas, permissões, SQL e transições de negócio não foram alterados. Os identificadores de teste foram preservados. Sem alterações em chaves ou configurações do banco.

## Verificações

- `npm test`: 267 testes passaram antes e depois da implementação.
- `npm run build`: passou, incluindo TypeScript e geração de rotas.
- `BASE_URL=http://127.0.0.1:3000 npm run e2e`: **10/10 passaram**, sobre o build de produção local. Inclui login, isolamento entre contas, preenchimento por quantidade e percentual, envio, devolução, reenvio, aprovação, contrato, nota fiscal e pagamento.
- ESLint dos componentes novos e dos principais arquivos alterados: passou.
- `git diff --check`: passou.
- Navegador: entrada, início, preenchimento em 320 e 390 px, aprovações em desktop e celular, folha do contrato. Campos da medição com 24 px; painel a 390 px sem transbordamento horizontal.

O lint global já contém 29 erros e 5 avisos, principalmente `any` na camada de dados/testes e `Date.now()` em prazos. Não foram alteradas essas regras de negócio para resolver lint nesta entrega. A revisão dos documentos foi visual no navegador; não houve conferência em impressora física. Não foi adicionado modo escuro.

## Ajustes nos testes existentes

O teste de contrato passou a abrir `botao-detalhe-por-local` antes de procurar o filtro: o detalhe já era recolhido por requisito anterior. O teste fiscal passou a aguardar o cartão e conferir cada um dos níveis 2 e 3 do seed; `isVisible()` imediato pulava essas aprovações durante o novo carregamento. Nenhuma asserção de aprovação foi removida. O endereço de verificação do servidor no Playwright agora acompanha `BASE_URL`.

O Docker estava parado após a interrupção da sessão. Foi reiniciado com os contêineres e dados existentes, sem reset de banco. Uma execução nesse intervalo falhou por conexão recusada; a execução posterior com ambiente disponível passou integralmente.

Os testes de ponta a ponta usam os dados locais de demonstração e deixam a medição corrente do Alfa no estado produzido pelo último cenário. A demonstração não foi resetada.

## Imagens da versão compilada

- [Entrada — desktop](entrada-desktop.png)
- [Entrada — celular](entrada-celular.png)
- [Início — celular](inicio-celular.png)
- [Preenchimento — celular](preenchimento-celular.png)
- [Preenchimento — 320 px](preenchimento-320.png)
- [Aprovações — desktop](aprovacoes-desktop.png)
- [Folha do contrato](folha-contrato.png)

Próximo passo: validar a identidade e a legibilidade com Pedro em seu aparelho. A publicação externa fica para a etapa de implantação.
