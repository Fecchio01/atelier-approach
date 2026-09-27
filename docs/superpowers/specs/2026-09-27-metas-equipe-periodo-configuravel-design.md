# Metas da equipe por período configurável

## Objetivo

Simplificar a página de Metas para a equipe definir os resultados que quer alcançar na semana e em um ciclo mensal próprio. A empresa escolhe o dia de início do ciclo mensal. Metas e relatórios devem usar os mesmos intervalos para comparar alvo e realizado.

## Decisões de produto

- Há uma meta da equipe por período; metas pessoais deixam de ser editáveis e exibidas na página de Metas e no painel.
- A meta semanal usa a semana de segunda-feira a domingo.
- A meta mensal usa um dia de início configurado pela empresa, entre 1 e 31. O ciclo é inclusivo no início e exclusivo no próximo início. Exemplo: início no dia 14 significa de 14 de maio até o fim de 13 de junho; o ciclo seguinte começa em 14 de junho.
- Se o dia escolhido não existir em um mês, usa-se o último dia daquele mês. Cada limite mensal é calculado a partir do dia configurado, sem deslocar permanentemente o ciclo. Exemplo com dia 31: 31 jan → 28 fev → 31 mar (ou 29 fev em ano bissexto).
- Na primeira configuração, o ciclo atual começa na ocorrência mais recente do dia escolhido. Alterar o dia recalcula imediatamente os limites do ciclo atual e o alvo salvo acompanha esse ciclo recalculado; ciclos já encerrados mantêm datas e resultados históricos.
- A tela de Metas permite editar e salvar uma meta semanal e uma meta mensal da equipe. Os relatórios permitem consultar o período semanal ou mensal correspondente e comparar realizado com meta.
- Registros de metas pessoais existentes deixam de aparecer na interface, mas não são apagados. Metas semanais existentes da equipe devem ser preservadas na migração.

## Indicadores das metas

Cada período aceita alvos de equipe para:

1. Abordagens registradas.
2. Interesses registrados.
3. Reuniões e retornos registrados.
4. Vendas fechadas.
5. Receita de vendas.
6. MRR de vendas.
7. Follow-ups concluídos no período.
8. Taxa de conversão, calculada como ganhos divididos por abordagens.

Os valores realizados devem reutilizar as fontes e definições já usadas em `lib/metrics.ts` e `lib/reports.ts`. Follow-ups concluídos são contados pela data de conclusão; vendas, receita e MRR seguem os eventos de venda reconhecidos pelo relatório atual. Conversão é exibida como percentual; quando não houver abordagens no período, a interface mostra “—” em vez de uma taxa enganosa. Cada alvo é opcional: campo vazio significa “sem meta”; metas de quantidade aceitam inteiros positivos, receita e MRR aceitam valores positivos, e conversão aceita percentual de 1 a 100.

O relatório mantém suas análises por canal, etapa do funil e membro da equipe, sem criar metas separadas para cada divisão. Follow-ups pendentes, cancelados e vencidos continuam como indicadores informativos; apenas concluídos recebem meta, pois representam produção concluída no intervalo.

## Períodos e relatórios

- “Semana” é de segunda-feira 00:00 até a segunda-feira seguinte 00:00, no fuso `America/Sao_Paulo`.
- “Ciclo mensal” é `[início, próximo início)`, com cada limite derivado do dia configurado e ajustado ao último dia disponível do mês.
- Os relatórios deixam de usar janelas móveis de últimos 7 e 30 dias quando comparados às metas. A seleção apresenta “Esta semana” e “Ciclo atual”, além de permitir consultar períodos anteriores sem mudar suas metas salvas.
- O relatório identifica claramente as datas inclusivas mostradas ao usuário e apresenta, por indicador, meta, realizado e progresso. Indicadores sem alvo configurado podem continuar aparecendo no relatório sem porcentagem de progresso.
- Todos os cálculos de limites usam uma única rotina de períodos compartilhada pela página de Metas, relatórios e painel para evitar diferenças de fuso ou de virada de mês.

## Dados e compatibilidade

O modelo de meta precisa identificar tipo de período e início do período, além do conjunto de alvos. A unicidade é por equipe, tipo de período e início. A configuração do dia de início mensal é guardada no escopo da empresa/equipe. O armazenamento de datas deve preservar limites locais do período sem depender da zona horária do navegador.

A migração preserva as metas semanais existentes da equipe, mapeando seus cinco alvos atuais. Novos alvos começam sem valor definido e podem ser configurados pela empresa. O armazenamento distingue ausência de alvo de uma meta positiva. Metas pessoais permanecem no banco, mas não participam dos novos cálculos de meta da equipe. Dados históricos de atividades e vendas não são alterados.

## Interface

- A página de Metas mostra dois períodos da mesma equipe: semanal e ciclo mensal configurável.
- A configuração do dia mensal é exibida junto à meta mensal e explica as datas do ciclo ativo.
- Campos são agrupados em produção comercial e receita, mantendo um formulário curto e legível.
- O painel resume o progresso da equipe para a semana atual e para o ciclo mensal atual, com ligação à página de Metas.
- O relatório apresenta o período selecionado, compara meta e realizado e mantém as tabelas analíticas atuais.

## Validação e falhas

- Rejeitar dias de início fora de 1–31, quantidades negativas ou fracionárias, valores monetários negativos e conversões fora de 0–100.
- Limites de períodos devem ser testáveis nos meses de 28, 29, 30 e 31 dias e em viradas de ano no fuso `America/Sao_Paulo`.
- Se não houver meta salva, o relatório ainda funciona e indica que a meta não foi configurada; não deve dividir por zero nem bloquear os indicadores realizados.
- Erros ao salvar exibem feedback na própria interface, preservando valores digitados.

## Fora de escopo

- Metas por pessoa, canal, categoria de lead ou etapa do funil.
- Metas diárias ou ciclos mensais com datas avulsas diferentes a cada período.
- Alterar a lógica de registro de atividades, vendas, MRR ou follow-ups.
- Apagar metas pessoais históricas.
