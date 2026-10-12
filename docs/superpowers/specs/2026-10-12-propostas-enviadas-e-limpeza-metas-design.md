# Metas importadas: propostas enviadas e indicadores relevantes

## Objetivo

Ao importar um PDF de metas, aproveitar os indicadores que já existem no sistema, deixar de sugerir métricas que a equipe considera redundantes ou sem utilidade e reservar indicadores personalizados para objetivos sem indicador correspondente. A tela deve mostrar o ícone da seção uma única vez, sem repetir ícones ao lado de cada meta.

## Decisões confirmadas

- “Propostas enviadas” será um indicador próprio dentro da seção “Avanço”. A meta importada será salva por ciclo e o realizado será calculado pelas transições de leads para a etapa `PROPOSAL` no período.
- “Respostas recebidas”, “Cadastros completos” e “Execução de novas abordagens” não serão importados como metas. Abordagens já cobre a atividade de prospecção; as outras duas métricas foram consideradas desnecessárias para este fluxo.
- O ícone do cabeçalho de cada seção permanece. O ícone exibido individualmente ao lado do nome de cada meta personalizada será removido.
- Os demais indicadores compatíveis com o modelo atual continuam mapeados aos respectivos indicadores existentes. Metas sem correspondência continuam personalizadas.

## Comportamento e dados

1. Adicionar `proposalsSent` ao tipo compartilhado de métricas, aos alvos de equipe e aos realizados. Persistir o alvo em `Goal` como campo opcional, preservando ciclos e registros antigos; a migração não deve apagar nem reescrever metas existentes.
2. Contar uma proposta quando o histórico registra a entrada do lead em `PROPOSAL` durante o período selecionado. Incluir a métrica nos relatórios por período e no cálculo de progresso da meta. Registros legados sem histórico estruturado só devem contar quando houver evidência de transição compatível, sem inferir proposta apenas do estágio atual.
3. Incluir “Propostas enviadas” no formulário de metas, no mapeamento do importador de metas e nos seletores de importação de resultados. PDFs que contenham o indicador devem preencher seu alvo, e importações de resultados devem poder atualizar seu realizado.
4. Ignorar, de modo explícito e testado, os rótulos “respostas recebidas”, “cadastros completos” e “execução de novas abordagens”; não os transformar em metas personalizadas.
5. Remover o ícone da linha de cada meta personalizada sem remover o ícone do cabeçalho da seção.
6. Ao importar novamente, substituir apenas metas personalizadas originadas de PDF, como o fluxo atual já faz; metas personalizadas criadas manualmente permanecem intactas. Nenhuma alteração automática destrutiva será feita nos alvos salvos fora desse fluxo.

## Critérios de aceitação

- Um PDF com “Propostas enviadas: N” sugere `Propostas enviadas` na seção Avanço, com alvo N e sem criar uma meta personalizada duplicada.
- O realizado semanal/mensal conta cada evento de entrada em `PROPOSAL` uma vez, dentro do ciclo correto.
- Os três indicadores explicitamente rejeitados não aparecem como sugestões, nem mesmo como metas personalizadas.
- Outros indicadores fixos continuam sendo associados ao alvo existente; um objetivo realmente sem correspondência continua podendo ser importado como personalizado.
- A linha individual de meta não tem ícone ao lado do nome; o cabeçalho da seção mantém seu ícone.
- Ciclos sem alvo de propostas continuam válidos e exibem ausência de meta, não uma meta zero.
- A suíte existente de metas, métricas, importações e relatórios continua passando.

## Escopo fora desta mudança

- Alterar as demais definições de interesse, reunião, venda ou follow-up.
- Excluir ou converter metas personalizadas manuais já salvas.
- Mudar layouts ou ícones dos cabeçalhos de seção.
