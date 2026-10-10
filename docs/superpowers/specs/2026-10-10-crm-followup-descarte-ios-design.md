# Follow-up, descarte automático e rolagem do funil — especificação de design

## Objetivo

Automatizar o ciclo de retorno das empresas no CRM sem perder o contexto da etapa anterior, avisar a equipe antes do descarte por inatividade, mover empresas sem avanço para a lixeira após o prazo definido e remover definitivamente itens antigos da lixeira. Corrigir também a rolagem horizontal do funil no Safari do iOS, preservando o uso por toque, mouse e teclado.

## Entendimento aprovado

- Uma empresa que precisa de follow-up deve aparecer na etapa `FOLLOW_UP`, não apenas continuar parada em outra coluna com um destaque vermelho.
- Ao entrar em Follow-up, o cartão deve indicar claramente a etapa de origem (por exemplo, “Veio de Abordado” ou “Veio de Em conversa”).
- O follow-up tem intervalo padrão de dois dias, respeitando a configuração compartilhada já existente.
- Ao confirmar/concluir o follow-up, a empresa retorna à etapa que tinha antes de entrar em Follow-up.
- A partir da conclusão do follow-up começa um novo prazo de cinco dias sem avanço. Se não houver avanço até o fim do prazo, a empresa vai automaticamente para a Lixeira, sem uma confirmação ou autorização manual.
- O painel avisa a equipe sobre empresas que estão se aproximando do descarte. Esse aviso é informativo e dá oportunidade de corrigir a etapa antes do prazo; ele não bloqueia nem exige aprovação para o descarte automático.
- Empresas na Lixeira há sete dias são excluídas permanentemente assim que o processamento automático alcançar o vencimento. A exclusão não depende de aprovação manual. A equipe também terá uma ação para esvaziar a Lixeira manualmente.
- O cartão/coluna de Follow-up permanece no funil.
- A primeira entrega inclui ciclo CRM, avisos no painel, lixeira e correção do scroll no iOS. Mensagens entre membros e a nova central de notificações ficam fora desta entrega, para uma especificação própria.

## Regras do ciclo de follow-up

1. Em uma etapa ativa do funil, a automação conta o intervalo configurado (dois dias por padrão) desde a entrada na etapa ou o último avanço. Se não houver avanço, move a empresa para `FOLLOW_UP` ao vencer o intervalo. Etapas terminais (ganho e lixeira) e a própria etapa Follow-up não são elegíveis.
2. A origem exata é persistida no ciclo de follow-up. A interface mostra essa origem no cartão e nos detalhes; não tenta inferi-la apenas pelo histórico mais recente.
3. O ciclo guarda vencimento, momento da entrada em Follow-up, origem e estado. Reprocessar a mesma empresa não cria ciclos ou atividades duplicados.
4. Ao concluir/confirmar o follow-up, uma transação registra a conclusão, restaura a empresa à etapa de origem e inicia o prazo de cinco dias sem avanço a partir daquele instante.
5. Durante esses cinco dias, a regra de dois dias não agenda outro follow-up. Se a empresa avançar para outra etapa antes do limite, o prazo de descarte é cancelado e a regra normal de dois dias volta a valer a partir do avanço. Nunca se reutiliza um vencimento antigo.
6. Follow-ups cancelados, empresas ganhas e empresas já descartadas não participam da automação de follow-up. Ações manuais válidas de etapa continuam disponíveis.
7. Um follow-up vencido não deve deixar a empresa escondida na etapa anterior: a empresa é movida para `FOLLOW_UP` e sinalizada como vencida até a equipe concluir, reagendar ou cancelar o ciclo.

## Avisos e descarte por inatividade

- O aviso aparece no Painel com nome da empresa, etapa atual, etapa de origem do follow-up, data de conclusão do follow-up e tempo restante.
- A lista contempla empresas dentro da janela de aviso anterior ao vencimento e empresas cujo vencimento chegou, mas que ainda aguardam o processamento. O aviso nunca substitui a regra automática.
- No quinto dia completo sem avanço depois de um follow-up concluído, o servidor move a empresa para `DISCARDED` e registra atividade/histórico explicando o descarte por inatividade.
- O prazo é calculado por instantes persistidos no servidor, não por relógio do navegador. A janela usa o padrão de data/hora já adotado no CRM e não muda com o fuso do aparelho.
- O trabalho automático deve ser idempotente, seguro para execução repetida e protegido por autenticação de serviço. Falhas são registradas e tentadas novamente; nenhuma falha deve apagar a empresa.
- Mover manualmente a empresa para outra etapa antes do vencimento cancela o descarte pendente. Uma ação manual de descarte continua distinguível da automação no histórico.

## Lixeira e exclusão permanente

- A data de entrada em `DISCARDED` é persistida de modo confiável. Se um registro antigo não tiver essa data explícita, a migração usa a primeira transição histórica para `DISCARDED`; se ela não existir, o registro legado é preservado até que a equipe o revise, em vez de estimar uma data e apagá-lo indevidamente.
- Ao completar sete dias na Lixeira, a empresa é excluída permanentemente no primeiro processamento agendado após o vencimento. A operação também pode ser acionada ao abrir/atualizar a Lixeira, desde que siga a mesma validação de idade.
- O comando “Esvaziar lixeira” exclui permanentemente apenas empresas que estão atualmente em `DISCARDED`, depois de confirmação explícita na interface. Empresas ativas nunca são incluídas por engano.
- Exclusões em lote e por vencimento são idempotentes e registram contagem/resultado operacional; a remoção segue as relações `onDelete` existentes e não deixa atividades órfãs.
- O prazo de sete dias não é prorrogado por visualização, atualização ou navegação.

## Rolagem horizontal do funil no Safari do iOS

- A rolagem horizontal precisa funcionar por gesto de toque sem exigir que a pessoa alcance uma barra localizada no fim da página.
- O diagnóstico deve distinguir rolagem interna do tabuleiro, scroll vertical da página e a barra horizontal sincronizada existente. A correção não deve interceptar gestos verticais nem impedir abrir/arrastar cartões.
- Remover ou ajustar qualquer barra redundante que esteja cobrindo os cartões; manter controles desktop úteis se forem compatíveis com o comportamento mobile.
- Preservar acessibilidade: área rolável identificável, foco/teclado onde aplicável, e controles sem depender exclusivamente de cor ou hover.

## Persistência e arquitetura

- Usar os estados `LeadStage` existentes (`FOLLOW_UP` e `DISCARDED`) e as entidades `FollowUp`/`StageHistory` quando forem suficientes; adicionar apenas os campos ou modelo de ciclo necessários para preservar etapa de origem, vencimentos e momento de início do prazo pós-follow-up de forma transacional.
- A criação/conclusão/reagendamento/cancelamento do ciclo e a mudança de etapa precisam ser atômicos no servidor. As atividades e o histórico atual permanecem auditáveis.
- Uma rotina agendada no servidor processa follow-ups devidos, descartes vencidos e exclusões de sete dias. As rotas são autenticadas e idempotentes; os critérios e a janela de execução devem ser validados com a plataforma de deploy durante o plano técnico.
- A consulta de leads do quadro e do Painel deve expor somente os novos campos necessários, evitando carregar dados completos de atividades para os cartões.
- Migrações são aditivas e compatíveis com leads e follow-ups existentes. Nenhuma empresa deve ser removida durante a migração.

## Falhas, reversão e concorrência

- Se a transação de conclusão do follow-up falhar, a empresa continua em `FOLLOW_UP` e o follow-up não aparece como concluído; a interface informa falha e permite tentar novamente.
- Se a rotina agendada falhar parcialmente, uma nova execução pode retomar sem duplicar atividades, mudança de etapa ou exclusões.
- Atualizações simultâneas (por exemplo, usuário movendo a empresa enquanto a rotina tenta descartá-la) devem usar condição de estado/versão no momento da gravação. A alteração manual válida prevalece quando ocorreu antes da automação.
- A exclusão permanente não é reversível pela aplicação. Só os registros que comprovadamente estão em `DISCARDED` há pelo menos sete dias são elegíveis para a rotina automática.

## Critérios de aceite

1. Uma empresa elegível que atinge o vencimento de follow-up vai para `FOLLOW_UP`, e seu cartão e detalhe mostram a etapa de origem correta.
2. Concluir o follow-up retorna a empresa à etapa de origem e inicia um novo prazo de cinco dias sem avanço.
3. Reagendar, cancelar ou processar novamente não cria ciclos/atividades duplicados nem inicia o prazo de descarte antes da conclusão.
4. Uma empresa que avança antes do limite de cinco dias não é descartada pelo vencimento anterior.
5. O Painel mostra aviso antes do limite e, mesmo sem interação da equipe, a empresa é movida para a Lixeira ao completar cinco dias sem avanço.
6. Uma empresa na Lixeira por menos de sete dias permanece; ao completar sete dias é removida no primeiro processamento posterior. Registros legados sem data confiável são preservados.
7. “Esvaziar lixeira” remove somente empresas atualmente descartadas, mediante confirmação, e lida corretamente com a lixeira vazia e erros parciais.
8. Execuções repetidas e concorrentes das rotinas não duplicam efeitos nem descartam uma empresa que já foi avançada manualmente.
9. No Safari iOS, o tabuleiro rola horizontalmente por toque, sem deslocamento vertical acidental, barra sobreposta ou exigência de scroll até o rodapé; desktop e teclado permanecem funcionais.
10. Testes de domínio, APIs/rotina agendada, migrações, interface e jornadas mobile cobrem os cenários acima; typecheck, lint, suíte de testes e build são verificados antes da publicação.

## Escopo técnico previsto

- `prisma/schema.prisma` e migração aditiva para ciclo/origem e temporizadores persistidos.
- `app/api/leads/[id]/route.ts` e endpoint agendado protegido para processar vencimentos e retenção da lixeira.
- `lib/` para transições idempotentes, relógio/fuso, elegibilidade, avisos e processamento de expiração.
- `components/kanban-board.tsx`, detalhes da empresa e `app/(app)/crm/page.tsx` para origem, transições e scroll responsivo.
- `app/(app)/page.tsx` e consultas do Painel para avisos de descarte próximos e vencidos.
- Rota/tela da Lixeira para “Esvaziar lixeira”, com confirmação explícita.
- Testes de domínio, API, cron/rotina, componentes e browser no Safari/WebKit mobile.

## Fora de escopo

- Conversas privadas, mensagens globais, feed de atualizações entre membros e central geral de notificações. Essas funções terão uma especificação arquitetural separada.
- Enviar e-mail, SMS, WhatsApp ou push como parte dos avisos do Painel.
- Excluir automaticamente empresas em qualquer etapa que não seja a Lixeira.
- Descarte automático sem um follow-up concluído que inicie o prazo de cinco dias.
- Alterar métricas, metas, preços, relatórios fechados ou a identidade visual geral do produto.
