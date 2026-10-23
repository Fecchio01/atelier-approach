# Fila compartilhada de ações do CRM

**Status:** aprovado para implementação em 2026-10-22.

## Objetivo

Dar à equipe uma fila única e compartilhada para tarefas comerciais vinculadas às empresas do CRM. Cada tarefa precisa ter responsável, tipo de ação, prioridade e vencimento; qualquer membro autenticado da equipe consegue consultar e operar a fila, com autoria registrada.

## Situação atual

- O CRM tem follow-ups persistentes (`FollowUp`) com responsável, data, estado e conclusão.
- O painel também mostra “Ações pendentes”, mas essas ações são sugestões calculadas a partir da etapa e do tempo sem avanço; elas não são tarefas persistidas nem podem ser concluídas na lista.
- O histórico (`Activity`) registra contatos, mudanças de etapa e eventos de follow-up/venda.

## Decisão de arquitetura

Adicionar um modelo persistente `CrmTask` separado de `FollowUp`. O modelo de follow-up mantém sua semântica e automações atuais; a nova fila agrega tarefas explícitas e follow-ups pendentes como tipos distintos. As sugestões calculadas do painel permanecem onde estão e não se convertem silenciosamente em tarefas.

Uma tarefa explícita contém: empresa relacionada, título, tipo (`WHATSAPP`, `PHONE`, `EMAIL`, `MEETING_PREP`, `OTHER`), prioridade (`LOW`, `NORMAL`, `HIGH`), data/hora de vencimento, responsável, autor, último editor, estado (`PENDING`, `COMPLETED`, `CANCELLED`) e timestamps/autoria da conclusão e cancelamento. O responsável padrão é quem cria; ele pode ser alterado para qualquer perfil de membro existente. Datas são persistidas em UTC e exibidas no fuso `America/Sao_Paulo`.

## Experiência e fluxo

1. Uma nova visão “Ações” dentro do CRM lista tarefas e follow-ups pendentes da equipe: primeiro vencidas, depois por vencimento mais próximo e, em empate, por prioridade (`HIGH`, `NORMAL`, `LOW`). A pessoa pode alternar entre todas as ações e as atribuídas a si, além de filtrar atrasadas, para hoje e futuras.
2. A criação acontece na fila e nos detalhes da empresa. O formulário pede empresa, tipo, descrição, responsável, prioridade e data/hora; não envia mensagens nem cria eventos externos.
3. Tarefas explícitas podem ser concluídas, canceladas, reatribuídas ou reagendadas na fila. Follow-ups agregados continuam abrindo o detalhe da empresa e usam o fluxo atual para concluir ou reagendar, sem duplicar estados.
4. Ao abrir uma ação, a equipe chega ao detalhe da empresa correspondente. A fila continua visível e consistente após atualização da página ou em outro dispositivo/membro.
5. O histórico da empresa registra criação, edição/reatribuição e conclusão da tarefa, com membro e horário. O próprio registro guarda estado e conclusão para evitar que histórico e fila diverjam.

## Acesso e segurança

- Todas as operações exigem uma sessão válida. O servidor deriva `createdById`, `updatedById` e `completedById` do usuário autenticado; nunca confia em IDs de autor enviados pelo navegador.
- O modelo atual é de uma equipe compartilhada: todos os membros autenticados veem as tarefas dessa equipe. A atribuição indica responsabilidade, não oculta a tarefa dos demais.
- A API valida existência da empresa e do perfil atribuído, valida tipo/estado/prioridade e aplica transições idempotentes para conclusão/reagendamento concorrentes.
- A nova tabela fica protegida por RLS e acessível apenas pelo papel de banco da aplicação, seguindo o padrão de políticas e grants já usado nas migrações Supabase/Prisma do projeto.

## Limites desta etapa

- Não altera regras de mudança automática de etapa nem o descarte por inatividade.
- Não substitui nem migra `FollowUp`; apenas os apresenta na mesma fila.
- Não executa WhatsApp, ligações, e-mails ou reuniões; os tipos descrevem a ação humana a realizar.
- Não inclui editor de automações, sequências, notificações push, vistas salvas ou regras avançadas de permissão.
- As sugestões do card “Ações pendentes” continuam calculadas e separadas nesta primeira versão.

## Critérios de aceite

- Uma tarefa criada por um membro aparece para os demais após atualização, em outra sessão/dispositivo, com a atribuição correta.
- Membros podem criar tarefa para uma empresa existente e atribuir a qualquer membro válido; entrada malformada ou referência inexistente é rejeitada sem gravação parcial.
- Concluir, cancelar, reagendar ou reatribuir uma tarefa atualiza a fila e registra o membro que fez a operação.
- Operações concorrentes não concluem/reagendam a mesma tarefa duas vezes nem apagam eventos de auditoria.
- Follow-ups pendentes continuam visíveis na fila com os fluxos de conclusão/reagendamento existentes; automações atuais permanecem inalteradas.
- Os filtros “Todas”, “Atribuídas a mim”, “Atrasadas”, “Hoje” e “Futuras” funcionam de forma combinável e são acessíveis por teclado e celular.
- Testes cobrem validação, autorização, transições concorrentes, agregação/ordenação da fila, criação e interação móvel; typecheck, lint, suíte focada e build de produção são verificados antes do deploy.

## Sequência para implementação

1. Adicionar modelo Prisma, migração PostgreSQL/RLS e testes da camada de domínio/repositório.
2. Criar endpoints autenticados para listar, criar e atualizar tarefas, com transações e autoria no servidor.
3. Implementar a visão compartilhada e filtros, mais criação rápida na fila e no detalhe da empresa.
4. Integrar follow-ups como projeções sem alterar seus endpoints ou regras atuais; verificar o fluxo com dois membros.
5. Rodar verificações completas aplicáveis, revisar diff, commitar, enviar ao GitHub e publicar no Vercel.
