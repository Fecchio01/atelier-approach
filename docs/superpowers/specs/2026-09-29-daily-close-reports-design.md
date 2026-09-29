# Fechamento diário e relatórios por período

## Objetivo

Permitir que a equipe encerre o dia com uma ação no Painel ou em Relatórios e consulte um relatório diário persistido com as atividades realmente registradas no CRM. Preservar os relatórios semanal e mensal existentes, que continuam agregando os registros de todos os dias dos respectivos períodos.

## Entendimento aprovado

- **Diário:** relatório do dia da equipe, salvo quando alguém autenticado usa “Fechar o dia”. O fechamento representa os dados que existiam no momento do clique.
- **Semanal:** visão acumulada das atividades entre segunda-feira e o início da segunda-feira seguinte, no fuso `America/Sao_Paulo`.
- **Mensal:** visão acumulada das atividades durante o ciclo mensal configurado pela empresa.
- Os relatórios semanal e mensal são calculados a partir dos registros-base do CRM, não pela soma dos fechamentos diários. Portanto, atividades de um dia sem fechamento continuam incluídas e não são duplicadas.
- O fechamento é único para a equipe por data local. Fechar novamente o mesmo dia retorna o relatório já salvo, sem substituí-lo nem criar outro.
- O fechamento não bloqueia o uso do CRM. Registros criados depois do clique não alteram retroativamente o relatório diário salvo.
- A experiência será responsiva e utilizável tanto em computador quanto em celular.

## Abordagem

Adicionar uma entidade persistida de fechamento diário no PostgreSQL usado pelo Prisma, com a data local convertida para os limites UTC do fuso de São Paulo, o instante e o membro que fechou, e um snapshot JSON do resumo diário e da lista de atividades. A unicidade por início do dia local impede duplicatas inclusive em cliques concorrentes. A migração será aditiva e não alterará nem removerá dados dos modelos existentes.

O resumo usará as fontes já adotadas pelo sistema: `Activity`, `StageHistory`, `SaleEvent` e eventos de follow-up. A lista de ações identificará, quando disponível, empresa, canal, horário e responsável. Métricas diárias contarão somente eventos do dia; estados atuais do funil não serão apresentados como se fossem atividade diária.

O endpoint de fechamento exigirá autenticação, fechará somente a data local corrente e será idempotente. Falha de banco ou de geração será informada sem indicar falso sucesso. Uma ausência de atividades ainda poderá produzir um relatório válido com totais zero e estado vazio.

## Experiência

- Exibir “Fechar o dia” no Painel e em Relatórios.
- Após o fechamento, substituir a ação por estado “Dia fechado” e um link para o relatório salvo.
- Incluir uma visão “Diário” em Relatórios, com seleção entre relatórios diários já fechados e lista cronológica de ações.
- Manter as visões semanal e mensal; seus rótulos e cálculos existentes continuarão claros e independentes dos fechamentos.
- Reutilizar a identidade visual atual e assegurar que controles, estado de carregamento, erros e listas permaneçam utilizáveis em telas estreitas.

## Fora de escopo

- Reabrir ou editar um fechamento já salvo.
- Impedir novas ações do CRM depois do fechamento.
- Substituir ou recalcular os relatórios semanais e mensais a partir dos snapshots diários.
- Implantar uma hospedagem Cloudflare permanente. O checkout não contém configuração de Pages/Workers; o endereço `trycloudflare.com` anteriormente usado é um Quick Tunnel temporário de teste, não uma hospedagem de produção. A entrega solicitada neste passo atualizará a prévia local exposta por esse túnel, se o processo continuar disponível. [Documentação de Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Critérios de aceite

1. Um membro autenticado pode fechar o dia pela interface no Painel ou em Relatórios, em desktop e mobile.
2. O fechamento guarda métricas e ações daquele dia usando limites do calendário de São Paulo.
3. Um segundo fechamento para a mesma data apresenta o snapshot original sem criar ou substituir registros.
4. Pessoas não autenticadas não podem fechar dia nem consultar um snapshot privado.
5. Relatórios semanais e mensais continuam contando diretamente todos os eventos do intervalo, incluindo dias sem fechamento.
6. A listagem diária permite abrir snapshots anteriores e comunica quando não há fechamento ou atividade.
7. Uma falha de rede, autenticação ou banco mantém a interface em estado não fechado e informa o erro.
8. A migração é aditiva, os testes existentes e os novos passam, e o build de produção é validado antes de atualizar a prévia Cloudflare.
