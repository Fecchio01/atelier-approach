# Proposta: metas, CRM e etapas do funil

## Objetivo

Deixar metas personalizadas visualmente coerentes com os indicadores existentes e tornar o fluxo operacional mais direto: uma venda não deve ficar bloqueada pela falta de preço, reunião não pode ser confundida com follow-up e lembretes pendentes precisam aparecer no painel.

## Decisões de produto

### Indicadores da equipe

- Indicadores personalizados passam a seguir o padrão visual dos indicadores existentes: valor atual e alvo em destaque, barra de progresso e edição pelo lápis, sem todos os campos de formulário abertos ao mesmo tempo.
- Métricas com origem em eventos do CRM são calculadas automaticamente para o ciclo. Para um indicador personalizado, a origem pode ser escolhida entre manual, abordagens, interesses, reuniões, follow-ups concluídos, vendas, receita, MRR e conversão.
- Indicadores sem origem automática continuam permitindo progresso manual. Indicadores importados de PDF começam em modo manual; nenhum vínculo será inferido apenas pelo nome, para evitar progresso incorreto.

### Fechamento de venda

- Mover uma empresa para “Ganho” finaliza a venda imediatamente, sem exigir preço ou MRR e sem abrir uma confirmação financeira bloqueante.
- Se os valores forem informados nesse momento, são registrados normalmente. Se forem omitidos, a venda conta como uma venda e receita/MRR ficam zerados até que sejam informados opcionalmente depois; nenhuma receita é inventada.
- O valor poderá ser complementado depois no detalhe da empresa sem criar uma segunda venda. A venda mantém sua identidade e data originais; a alteração financeira deve ser registrada no histórico de atividades para auditoria.
- Follow-ups ainda pendentes da empresa são cancelados automaticamente quando ela é marcada como ganha.
- Continua possível reabrir uma empresa conforme o comportamento atual; não se apagam eventos ou histórico por reabertura.

### Etapas do funil

- “Novo” deixa de ser uma coluna e não é aceito como destino para novas alterações.
- Novas empresas entram em “Abordado”. Registros antigos ainda persistidos como `NEW` são apresentados e contabilizados como “Abordado”, sem apagar ou reescrever seu histórico.
- Adiciona-se a etapa `MEETING` (“Reunião”), separada de `FOLLOW_UP` (“Follow-up”).
- O relatório de reuniões passa a contar somente transições para `MEETING`; follow-ups concluídos continuam sendo contados pelo registro e horário de conclusão do follow-up.
- Transições históricas para `FOLLOW_UP` deixam de ser interpretadas como reunião. Relatórios semanais/mensais ainda abertos podem, portanto, apresentar uma contagem de reuniões menor após a atualização. Relatórios diários já fechados permanecem snapshots imutáveis.

### Follow-ups no painel

- O painel apresenta três listas distintas: atrasados, previstos para hoje e próximos pendentes.
- A classificação de data segue o fuso `America/Sao_Paulo` já usado pelo sistema. Follow-ups concluídos ou cancelados não aparecem como pendentes.
- As listas mostram a empresa, o responsável e a data; o conjunto de lembretes continua acessível pelo CRM.

## Compatibilidade e persistência

- O enum PostgreSQL mantém `NEW` como valor legado, evitando reconstruir o tipo e reescrever históricos. O default do banco e o código de criação passam a usar `CONTACTED`.
- A migração adiciona `MEETING` ao enum `LeadStage`; não remove registros nem reclassifica históricos existentes.
- Metas personalizadas guardam uma origem opcional no JSON já existente. Registros antigos sem origem são tratados como manuais. O progresso derivado de origem automática não sobrescreve o progresso manual armazenado.
- O formato atual de `SaleEvent` e seus valores seguem compatíveis; omissão financeira é representada como zero no evento para preservar as métricas e os consumidores atuais. Complementar os valores atualiza os dados financeiros da venda original, sem criar outro evento ou incrementar novamente a quantidade de vendas.

## Critérios de aceite

1. Um lead pode ser marcado como ganho com apenas uma ação; o evento conta como venda mesmo sem valores financeiros.
2. Nenhuma receita/MRR é inventada quando não há valores informados; se fornecidos ao fechar ou complementados depois, os relatórios exibem os valores, sem duplicar a venda.
3. Nenhum lead novo aparece na coluna “Novo”; dados antigos em `NEW` aparecem em “Abordado”.
4. Uma transição `MEETING` soma reunião, mas uma transição `FOLLOW_UP` ou conclusão de follow-up não soma reunião.
5. Follow-ups atrasados, de hoje e futuros pendentes aparecem na categoria correta do painel; concluídos/cancelados não aparecem.
6. Indicadores personalizados exibem o mesmo padrão visual compacto dos demais e continuam editáveis pelo lápis; origem manual preserva edição do progresso e origem CRM reflete eventos do período.
7. Os testes cobrem a migração/normalização de etapas, atualização de venda sem preço, relatório de reuniões e follow-ups, painel e metas personalizadas; typecheck, lint, suíte de unidade e build são verificados.

## Escopo técnico previsto

`prisma/schema.prisma` e uma migração PostgreSQL; `lib/funnel.ts`; `app/api/leads/route.ts` e `app/api/leads/[id]/route.ts`; `components/lead-detail-modal.tsx` e `components/kanban-board.tsx`; cálculo de métricas e relatórios em `lib/metrics.ts` e `lib/reports.ts`; painel em `app/(app)/page.tsx`; metas em `app/(app)/metas/goal-form.tsx` e `custom-goal-metrics.tsx`; e testes unitários correspondentes.

## Fora de escopo

- Integração com APIs de WhatsApp ou detecção automática de conversas humanas fora dos eventos que o CRM registra.
- Adivinhar a origem de um indicador personalizado com base somente no texto do PDF.
- Apagar o valor legado `NEW` do enum do banco ou reescrever eventos de vendas e snapshots de relatórios já fechados.
- Publicar em produção; isso será feito somente após implementação e validação, se solicitado.
