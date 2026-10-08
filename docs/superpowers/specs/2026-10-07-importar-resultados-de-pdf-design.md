# Importar resultados de PDF — especificação de design

## Objetivo

Permitir que a equipe importe resultados realizados de um PDF — totais por indicador e período — para complementar os eventos registrados no CRM. Os valores importados devem permanecer salvos e alimentar o progresso das metas e os números do Painel e de Relatórios, sem alterar nem simular eventos no funil.

## Entendimento aprovado

- A importação contém **realizado**, não alvos. Ela é separada do importador de metas já existente.
- Cada valor importado pertence a um indicador e a um intervalo de datas explícito.
- Os valores importados são somados aos valores do CRM para o mesmo indicador e período; não substituem nem alteram os registros do CRM.
- A mesma importação não pode ser contabilizada duas vezes.
- Os resultados devem persistir entre navegação, recarga e novas sessões.
- Relatórios continuam sendo calculados no próprio sistema a partir do CRM e dos resultados importados.
- A visão diária permanece em Relatórios. O PDF diário só é baixável após fechar o dia; fechamentos existentes continuam imutáveis e idempotentes.
- Nas metas semanais, cada indicador mantém uma trilha visual alinhada às demais; sem alvo configurado, exibe “Sem meta”, sem percentual inventado.

## Experiência

1. A página Metas ganha uma ação separada, “Importar resultados (PDF)”, distinta da importação de metas/alvos.
2. O PDF é processado localmente no navegador, reutilizando a infraestrutura de extração PDF existente. O documento original não é enviado nem armazenado.
3. A aplicação sugere linhas reconhecidas por indicador e valor realizado e tenta identificar o período no texto. Na revisão, a pessoa confirma ou corrige intervalo e valores antes de salvar.
4. Se o período não puder ser reconhecido com segurança, a pessoa informa as datas. Não se presume “semana atual” ou “ciclo atual”.
5. A revisão mostra o que será contabilizado e alerta quando já existe importação registrada para o mesmo intervalo. Uma importação idêntica não pode ser somada outra vez.
6. Uma área de histórico mostra período, nome do arquivo, data de importação e valores. A pessoa pode remover uma importação incorreta; essa remoção afeta apenas os resultados importados, nunca os registros do CRM.
7. Uma importação diferente para o mesmo intervalo é adicionada somente após confirmação clara de que os valores são adicionais. Para substituir um lote antigo, a pessoa remove o lote anterior antes de importar o novo.

## Interpretação dos indicadores

- Mapear os oito indicadores de CRM existentes por aliases explícitos: abordagens, interesses/qualificados, reuniões, vendas, receita, MRR, follow-ups concluídos e taxa de conversão.
- Não converter um rótulo desconhecido em métrica de CRM por semelhança parcial. Linhas desconhecidas permanecem editáveis na revisão e só podem ser salvas como resultado de indicador personalizado quando houver indicador correspondente no ciclo selecionado.
- Para resultados personalizados, corresponder ao indicador do ciclo pelo identificador estável quando disponível; como fallback, exigir correspondência exata do nome normalizado e da unidade. Não criar automaticamente uma nova meta/alvo ao importar realizado.
- Valores ambíguos, unidades incompatíveis, linhas sem indicador e períodos incompletos não são adivinhados; a revisão deve pedir correção ou permitir remover a linha.
- Conversão é uma taxa, não uma quantidade. Ao combinar importação e CRM, a taxa deve ser recalculada a partir de numerador e denominador somente quando esses totais estiverem presentes no mesmo lote. Caso contrário, preservar o realizado importado para a métrica de conversão do período e não recalcular a partir de abordagens e vendas combinadas.

## Períodos e agregação

- Persistir `periodStart` e `periodEnd` como limites semiabertos `[início, fim)`, normalizados para o fuso `America/Sao_Paulo`.
- Um total agregado não pode ser distribuído artificialmente entre dias nem somado a uma janela parcialmente sobreposta.
- O lote só contribui para um relatório quando o intervalo importado coincide exatamente com a janela do relatório. A interface mostra o intervalo dos lotes considerados.
- Para Relatórios diários, só lotes de um único dia que coincidam com a data local do snapshot entram no fechamento. Sem um lote diário exato, nenhum total semanal/mensal é rateado para aquele dia.
- O progresso de Metas consulta importações do mesmo ciclo selecionado. O Painel inclui lotes que coincidam com a janela que seus indicadores estão exibindo.
- Relatórios semanais e de ciclo continuam incluindo atividades CRM dos dias sem fechamento, não somam snapshots diários e não alteram cálculos históricos salvos.

## Persistência e segurança

- Acrescentar modelos Prisma para lote de importação e linhas de resultados. Cada lote registra identificador, equipe/autor autenticado, nome do arquivo, hash SHA-256, intervalo, data de criação e linhas normalizadas. Valores monetários usam decimal; contagens e taxas usam precisão numérica suficiente sem conversão prematura para inteiro.
- Cada linha guarda a chave de métrica fixa ou o indicador personalizado relacionado, valor realizado e unidade apresentada. O servidor valida chaves permitidas, limites de linhas, tamanhos de texto, valores finitos, não negativos e intervalo válido.
- Uma restrição única por equipe, hash e intervalo torna o reenvio idêntico idempotente. Nenhum `Lead`, `Activity`, `StageHistory`, `SaleEvent` ou `DailyReport` existente é alterado pela importação.
- Usar migração PostgreSQL aditiva e atualizar o histórico Prisma de acordo com o procedimento do repositório. Testar primeiro no schema isolado; não rodar migração de produção com a conta restrita da aplicação.
- Requer autenticação para listar, importar e remover lotes. A identidade da equipe/autor vem da sessão no servidor, nunca de campos confiados ao navegador.

## Integração com Metas, Painel e Relatórios

- Criar uma função de domínio única para somar os valores de lotes que correspondem exatamente a uma janela de período. Metas, Painel e Relatórios devem usar essa regra compartilhada, evitando divergência entre telas.
- Somar valores fixos importados aos realizados vindos do CRM. Não alterar alvos das metas nem emitir eventos por empresa/membro para os totais importados.
- Resultados agregados não têm atribuição confiável a membros individuais. Eles aparecem apenas nos totais da equipe; tabelas individuais e contagens por canal continuam refletindo somente registros CRM atribuídos.
- Em Metas, os indicadores fixos mostram o CRM mais os valores importados do ciclo; indicadores personalizados exibem valor importado apenas quando houver associação inequívoca ao item do ciclo.
- Painel e relatório devem indicar visualmente quando um total inclui lote importado e permitir consultar o intervalo/origem, sem apresentar esses valores como atividade individual.
- A taxa de conversão combinada segue a regra acima; não se deve somar duas porcentagens nem recalcular sem numerador e denominador compatíveis.

## Barra de progresso semanal sem alvo

- Em `TeamGoalProgress`, sempre reservar o mesmo espaço visual para o progresso na variante expandida, inclusive na visão semanal.
- Sem alvo: desenhar somente a trilha neutra e mostrar “Sem meta” como estado textual; não usar `role="progressbar"` nem `aria-valuenow` sem um alvo válido.
- Com alvo: preservar o percentual, animação e semântica acessível existentes.
- Manter o comportamento compacto do Painel, salvo o necessário para consistência visual.

## Fechamento e download diário

- Preservar a rota diária atual de Relatórios, seleção de data, histórico, fechamento e PDF.
- O download continua disponível somente para uma data com snapshot já fechado.
- Um novo fechamento inclui resultados importados somente se seu lote for exatamente daquele dia e já existia no instante do fechamento. O snapshot guarda os totais e identifica os lotes considerados, para continuar imutável depois.
- Fechamentos anteriores não são recalculados ao importar ou remover lotes posteriormente.

## Falhas e estados

- Distinguir: arquivo inválido, acima do limite, texto não selecionável, extração sem resultados, período ausente, revisão, duplicidade, confirmação de lote adicional, salvando, salvo e falha de persistência.
- Falha ao salvar mantém o rascunho visível para nova tentativa. Reenvio de lote já salvo informa que já foi registrado, sem retornar sucesso enganoso nem somar valores outra vez.
- Remoção exige confirmação explícita e não pode apagar dados de CRM nem um snapshot diário já fechado.

## Validação

- Testes unitários do parser com totais, aliases, unidade/moeda brasileira, datas de início/fim, valores ambíguos, rótulos desconhecidos e PDF sem texto.
- Testes de domínio provando soma de CRM + importação, idempotência por hash, exclusão de janelas parcialmente sobrepostas, período diário exato, associação de indicador personalizado e regra para conversão.
- Testes de API/ações para autenticação, validação, persistência, reenvio, remoção isolada e erros de banco.
- Testes de `buildReport`, `getTeamGoalActualsByPeriod`, metas e snapshot diário para confirmar que lotes são considerados uma única vez, que históricos fechados não mudam e que linhas individuais/canais seguem somente dados atribuídos do CRM.
- Testes de componente para barra semanal com e sem meta, incluindo semântica acessível.
- Testes E2E em Metas e Relatórios para importar, corrigir período, salvar, navegar, recarregar, conferir totais e remover o lote; validar que download diário só aparece após fechamento.
- Rodar a suíte unitária, typecheck, lint e build de produção; executar os E2E relevantes contra schema de teste isolado.

## Fora do escopo

- OCR de PDFs escaneados ou processamento por serviço externo/IA.
- Criar eventos CRM fictícios, distribuir agregados por empresa, canal, dia ou membro.
- Alterar alvos ao importar resultados.
- Ratear totais de intervalos arbitrários por dias, semanas ou ciclos parcialmente coincidentes.
- Recalcular ou sobrescrever relatórios diários já fechados.
