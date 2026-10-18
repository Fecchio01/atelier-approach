# Colaboração segura e autoria no histórico do CRM

## Objetivo

Evitar que uma mudança de etapa feita com dados desatualizados sobrescreva a mudança de outra pessoa e deixar visível, no histórico da empresa, qual membro realizou cada ação. A entrega aproveita o estado compartilhado, as atividades e os perfis já existentes.

## Contexto observado no código

- O funil compartilhado já consulta uma versão do quadro periodicamente e chama `router.refresh()` quando encontra mudanças.
- As alterações de etapa já são gravadas em `StageHistory` e também geram uma `Activity` com `actorId`.
- O detalhe da empresa já apresenta atividades em ordem cronológica, mas mostra o tipo, canal, horário e nota sem resolver o identificador do autor para o nome do membro.
- `MemberProfile` já guarda nome e avatar por identificador. Não é necessária uma nova tabela para exibir autoria.

## Decisões de produto e comportamento

### Proteção de mudanças concorrentes

- Para uma alteração manual de etapa, o cliente envia a etapa e o `stageEnteredAt` que leu antes da edição, junto com a nova etapa desejada.
- O servidor efetua uma atualização condicional atômica, comparando o registro atual com a etapa e o timestamp esperados. A gravação do lead, do histórico de etapa, da atividade e dos efeitos relacionados continua dentro da transação existente.
- Se outra pessoa tiver alterado a etapa desde que o formulário foi aberto, a operação inteira é recusada com HTTP `409`; nenhuma atividade nem histórico parcial é criado.
- A resposta de conflito informa um código estável e a etapa/timestamp atuais, sem revelar dados de contato. A interface informa que outra pessoa atualizou a empresa, atualiza os dados apresentados e não repete a ação automaticamente.
- O usuário pode revisar a etapa atual e decidir se deseja tentar a operação novamente. Não se usa “última gravação vence” para mudanças de etapa.
- Alterações que não mudam etapa continuam com o comportamento atual; impedir conflitos simultâneos em campos não relacionados não faz parte desta fase.

### Autoria das atividades

- O GET de detalhe resolve os `actorId` presentes nas atividades para os nomes existentes em `MemberProfile`.
- A interface mostra o nome do autor junto ao tipo/canal e horário da atividade.
- Se um perfil não existir mais, a interface usa o texto neutro “Membro da equipe”; o histórico continua visível e não falha por falta do perfil.
- Não retornar e-mails nem imagens de avatar no payload de atividades. Não adicionar nova relação Prisma ou migração nesta entrega.

## Arquitetura e limites

- Alterações limitadas ao handler de detalhe do lead, ao modal do CRM, aos tipos serializados compartilhados e aos testes correspondentes.
- Reutilizar `StageHistory`, `Activity`, `MemberProfile` e a transação já existente.
- Preservar os prazos, regras e etapas atuais do funil, o processamento agendado, o polling do quadro e os lembretes internos.
- Não adicionar notificações externas, dependências, tabelas, campos de banco ou serviços pagos.
- O REA é ferramenta de inspeção usada para comparar padrões de produtos; não é dependência nem funcionalidade a ser embutida no CRM.

## Falhas e recuperação

- Se o registro não existir, manter o `404` atual.
- Se a etapa ou timestamp esperados forem inválidos/ausentes em uma requisição que muda etapa, retornar `400` com erro compreensível, sem iniciar uma atualização parcial.
- Em conflito, responder `409` com `{ code: "STAGE_CONFLICT", currentStage, currentStageEnteredAt }`; a UI mostra um aviso acessível, adota a etapa atual recebida e pede uma nova decisão explícita.
- Falhas inesperadas continuam retornando o erro genérico atual. Não incluir credenciais ou dados pessoais desnecessários em logs.

## Critérios de aceite

1. Quando duas sessões tentam mudar a mesma empresa a partir do mesmo estado, no máximo uma transição é gravada; a outra recebe `409`.
2. A chamada concorrente recusada não cria `StageHistory`, `Activity`, follow-up ou evento de venda parcial.
3. Uma transição válida ainda atualiza etapa, `stageEnteredAt`, histórico e atividade na mesma transação e o quadro compartilhado é atualizado pelo mecanismo existente.
4. Uma alteração feita após o primeiro cliente ficar desatualizado retorna conflito, inclusive quando a empresa saiu da etapa e depois voltou a ela (checagem de timestamp evita aceitar estado antigo equivalente).
5. A linha do tempo mostra o nome correto de cada autor e continua renderizando atividades quando o perfil correspondente não está disponível.
6. O payload de atividade não inclui e-mail nem avatar.
7. Testes unitários/de rota cobrem validação, concorrência, ausência de efeitos parciais, enriquecimento do histórico e fallback de perfil; um teste de interface cobre o aviso e a atualização após conflito.
8. Typecheck, lint, testes direcionados, suíte relevante e build passam sem alterar arquivos locais não relacionados.

## Fora de escopo

- Sincronização em tempo real por WebSocket/Supabase Realtime; o polling atual permanece.
- Conflitos para notas, dados de contato, valores de venda ou mudanças de foto/perfil.
- Redesenho das etapas, novas automações, novo painel de tarefas ou mudança de prazos.
- Correção retroativa de eventos existentes ou limpeza de dados.
- Deploy ou configuração de segredo/ambiente como parte da especificação. Após a implementação e validação, publicar o commit aprovado no fluxo GitHub/Vercel existente, sem alterar dados de produção.
