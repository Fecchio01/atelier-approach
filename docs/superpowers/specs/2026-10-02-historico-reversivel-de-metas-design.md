# Histórico reversível de metas — especificação de design

## Objetivo

Permitir que a equipe use a importação de PDF como atalho, sem transformar a configuração extraída em uma escolha irreversível. Uma meta importada continua sendo uma meta normal: pode ser editada manualmente, substituída por outro PDF ou restaurada para uma versão salva anteriormente.

## Estado atual e lacuna

O PDF é lido localmente e suas sugestões entram no formulário como rascunho. Importar ou aplicar sugestões não salva nada no servidor; a persistência só ocorre quando a pessoa salva o ciclo. Depois desse salvamento, os campos da meta atual são sobrescritos e não há histórico recuperável. Hoje, para voltar a valores antigos, a pessoa precisa lembrá-los e digitá-los novamente ou importar de novo o documento original.

Não existe um “modo PDF” persistente. O PDF fornece valores para o mesmo formulário semanal ou mensal que também pode ser preenchido manualmente. O arquivo original não será armazenado.

## Experiência

1. A pessoa seleciona um PDF e revisa as sugestões antes de aplicá-las, como hoje.
2. Aplicar as sugestões altera somente o rascunho da aba/ciclo atual. A ação **Desfazer importação** retorna ao rascunho que existia imediatamente antes daquela aplicação; ainda será possível editar manualmente e salvar.
3. Ao salvar, o sistema grava atomicamente a configuração atual e uma revisão imutável daquela versão.
4. A área **Versões salvas** fica disponível em cada ciclo Semanal e Mensal. Cada item identifica data e hora, ciclo e origem da gravação (manual, importação revisada ou restauração), sem guardar nem expor o PDF.
5. Restaurar uma versão exige confirmação clara de qual configuração salva será substituída. A restauração cria uma nova revisão com o conteúdo restaurado; não apaga nem reescreve as versões existentes. A pessoa pode continuar editando e salvando normalmente depois.

## Semântica de restauração

- Cada revisão registra os alvos das métricas fixas e a lista completa de métricas personalizadas, incluindo valores de progresso manual, nome, unidade, ícone e identificadores.
- Restaurar uma revisão recupera exatamente esses valores de configuração e de progresso manual personalizado daquele instante.
- O progresso das métricas fixas continua calculado a partir das atividades reais do CRM. Restaurar metas não apaga, altera nem restaura leads, contatos, vendas ou históricos do CRM.
- Revisões pertencem ao mesmo proprietário, tipo de ciclo e início do período. A restauração semanal não afeta o ciclo mensal, e vice-versa.
- O dia configurável de início mensal permanece nas configurações atuais; restauração de uma meta não muda esse ajuste.
- O histórico é aditivo: gravar, restaurar ou alterar metas nunca remove versões anteriores.

## Dados e gravação

Adicionar um modelo de revisão associado ao conjunto de metas por equipe/ciclo. A revisão guarda um snapshot validado de todos os alvos fixos e métricas personalizadas, timestamp, autor, tipo de operação e, em caso de restauração, referência à revisão de origem. Não guardar conteúdo do PDF nem caminhos/nome local do arquivo.

Toda gravação bem-sucedida de meta cria a revisão correspondente e atualiza a meta ativa na mesma transação do banco. Em caso de erro, nenhum dos dois estados é confirmado e os valores permanecem no formulário. A restauração também atualiza a meta ativa e cria sua nova revisão atomicamente. O endpoint/ação valida autenticação, escopo da equipe, ciclo permitido, campos numéricos e métricas personalizadas pelo validador existente; identificadores de proprietário e ciclo não são confiados ao cliente.

A migração cria uma revisão inicial de origem `BASELINE` a partir dos valores já existentes em cada registro `Goal`, incluindo metas antigas de períodos ainda consultáveis. Assim, o conjunto usado antes da funcionalidade já pode ser restaurado após uma importação futura. Essa revisão é uma cópia fiel dos dados existentes, não uma inferência. Registros atuais e cálculos existentes permanecem intactos.

## Falhas e acessibilidade

- Se a gravação falhar, mostrar erro e preservar o formulário; não indicar versão salva.
- Se uma restauração falhar, manter a versão ativa atual e informar que nenhuma alteração foi concluída.
- A confirmação de restauração informa que os alvos e indicadores personalizados atuais serão substituídos e que o progresso automático do CRM não será alterado.
- A lista de versões usa controles acessíveis por teclado e nomes claros em português; não depende de cor ou ícones isolados.
- Se uma revisão antiga não passar pela validação atual, não aplicá-la parcialmente; explicar que a versão não pode ser restaurada e manter o estado atual.

## Compatibilidade e escopo

- Preservar o layout e os fluxos das metas semanais e mensais e a importação local de PDF.
- Não mudar o cálculo das métricas automáticas, relatórios, fechamento diário ou configuração do período.
- Não enviar, armazenar ou processar PDFs no servidor.
- Não introduzir um modo exclusivo de metas importadas.

## Validação e aceite

- Testes de unidade validam snapshot/serialização e escopo por ciclo, inclusive métricas personalizadas e números.
- Testes de ação verificam gravação e revisão na mesma transação, falha atômica, autenticação e restauração sem perda do histórico.
- E2E semanal e mensal: aplicar PDF, desfazer antes de salvar, salvar a configuração revisada, editar/salvar uma nova versão, recarregar e restaurar a primeira versão; conferir configuração restaurada e progresso automático ainda ligado aos dados atuais do CRM.
- E2E valida confirmação e cancelamento de restauração e preservação dos valores em falha de rede/servidor.
- Rodar testes relevantes de metas, typecheck, lint e build de produção.
