# Calendário de ações do CRM

**Status:** aprovado para implementação em 2026-10-24.

## Objetivo

Adicionar uma visualização de calendário à aba **Ações** do CRM para a equipe acompanhar tarefas e follow-ups pelo vencimento, sem duplicar registros nem alterar as automações comerciais existentes.

## Decisões aprovadas

- O calendário será uma alternativa visual dentro da aba **Ações**, ao lado da lista atual.
- Usará as tarefas e os follow-ups persistidos já agregados pela fila compartilhada.
- Desktop apresenta uma semana; celular apresenta uma agenda diária.
- Navegação terá **Hoje**, dia/semana anterior e próximo dia/semana.
- Os filtros atuais de responsável e período continuam combináveis e disponíveis nas duas visualizações.
- Tarefas e follow-ups terão sinais visuais distintos.
- Selecionar uma tarefa permite abrir a empresa e usar as ações existentes para editar, reagendar, concluir ou cancelar. Selecionar follow-up abre o detalhe da empresa e preserva o fluxo atual de conclusão/reagendamento.
- Criar uma ação a partir de uma data selecionada preenche essa data no formulário; os demais campos e validações seguem o fluxo atual.
- Datas são agrupadas e exibidas no fuso `America/Sao_Paulo`.

## Fora de escopo

- Sincronização com Google Calendar ou outros serviços externos.
- Alterações ao schema, APIs, estados ou regras de automação de tarefas/follow-ups.
- Criar cópias de follow-ups ou mover uma ação para outro sistema de armazenamento.
- Notificações ou novas regras de atribuição.

## Abordagem técnica

O componente `CrmActionQueue` manterá a fonte de dados, os filtros, o polling e as mutações atuais. Um controle de visualização alternará entre lista e calendário. Helpers puros para datas de calendário usarão chaves e formatação de `America/Sao_Paulo`, enquanto o formulário existente continuará convertendo a data local para UTC pelo parser já usado no CRM. Nenhuma mutação de follow-up será introduzida no calendário.

## Critérios de aceite

1. Lista e calendário mostram a mesma fila filtrada, sem duplicação ou divergência.
2. A semana de desktop distribui itens no dia local correto e mostra hora, nome da empresa, descrição e tipo.
3. Em telas pequenas, a experiência vira uma agenda de um dia por vez, com navegação por datas e sem exigir rolagem horizontal.
4. Hoje/anterior/próximo respeitam a semana iniciada na segunda-feira e o fuso de São Paulo.
5. Os filtros de responsável e período continuam aplicáveis no calendário.
6. Criar ação por data pré-seleciona o dia escolhido; edição, conclusão e cancelamento continuam usando endpoints existentes.
7. Follow-ups abrem a empresa e mantêm o caminho de edição/conclusão já existente.
8. Nenhum schema, endpoint ou dado persistido precisa de migração.
