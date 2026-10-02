# Importar metas de PDF — especificação de design

## Objetivo

Reduzir o trabalho manual para configurar as metas da equipe. A pessoa poderá escolher um PDF com os objetivos da empresa, revisar os indicadores e valores extraídos, completar ou corrigir os dados e salvar o conjunto no ciclo semanal ou mensal atualmente selecionado.

O sistema continuará preservando as metas e o visual atuais. Indicadores já ligados ao CRM continuarão calculando seu progresso pelos registros existentes. Indicadores personalizados permitirão atualizar o progresso manualmente.

## Experiência proposta

1. Dentro da aba Semanal ou Mensal, a pessoa seleciona um PDF no novo bloco de importação.
2. O navegador extrai o texto do arquivo localmente. O PDF não é enviado a serviço externo nem armazenado.
3. A aplicação sugere indicadores conhecidos e metas personalizadas, quando reconhecer linhas ou valores com confiança suficiente.
4. Antes de salvar, a pessoa vê uma revisão editável: nome, unidade, alvo, progresso inicial e, para indicadores conhecidos, o mapeamento para a métrica do CRM. Ela pode corrigir, remover ou adicionar itens. A aba de ciclo selecionada define em qual período salvar.
5. A pessoa confirma “Salvar metas”; só então a aplicação persiste as metas daquele ciclo.

O bloco de revisão reutiliza a identidade visual existente de metas, com ícones Phosphor mapeados por palavras-chave e um ícone neutro como fallback. Não serão usados emojis. Após salvar, o resultado aparece nas seções atuais Prospecção, Avanço e Receita; indicadores personalizados aparecem em uma seção coerente de metas personalizadas, mantendo o mesmo tratamento de cards e progresso.

### Extração e limitações

- Aceitar somente arquivos PDF e limitar o tamanho para proteger memória e tempo de processamento no navegador.
- Usar um extrator compatível com o navegador (planejado: `pdfjs-dist`) e processar o conteúdo na máquina do usuário.
- Na primeira versão, aceitar PDFs com texto selecionável. Não fazer OCR nem enviar documentos a IA/API externa.
- Se não for possível extrair texto, se o arquivo estiver inválido ou se não houver valores interpretáveis, mostrar uma mensagem útil e manter a opção de continuar preenchendo as metas manualmente.
- A extração é uma sugestão, não uma afirmação de precisão. Nenhum alvo ou progresso é salvo sem revisão e confirmação.
- Reconhecer rótulos conhecidos por uma lista explícita de aliases para as oito métricas atuais (abordagens, interesses, reuniões, vendas, receita, MRR, follow-ups concluídos e taxa de conversão). Outros rótulos podem virar indicadores personalizados. Valores ambíguos não são adivinhados.

## Dados e persistência

O modelo `Goal` existente representa o conjunto de alvos de uma equipe por tipo e janela de ciclo; os oito indicadores existentes têm colunas e cálculo de progresso próprios. Para evitar alterar esse comportamento, acrescentar ao registro do ciclo uma coleção JSON aditiva de metas personalizadas, com itens versionáveis e validados no servidor:

- identificador estável;
- nome e unidade opcional;
- alvo numérico positivo;
- progresso atual numérico não negativo, editável manualmente;
- chave semântica de ícone opcional, selecionada de uma lista permitida (não guardar componente/código arbitrário).

Uma migração aditiva com valor padrão vazio deve preservar todos os registros de metas existentes. O servidor validará limite de itens, comprimentos dos textos, números finitos e não negativos, identificadores únicos e chaves de ícone permitidas. Apenas usuário autenticado pode gravar; o owner e o ciclo continuam sendo os valores da equipe e da aba de destino, nunca dados confiados ao cliente.

Editar alvos ou progresso das metas personalizadas atualiza somente essa coleção dentro da janela selecionada. Métricas fixas continuarão sendo atualizadas pelo fluxo atual e não permitirão progresso manual para evitar divergência com o CRM. Remoções só removem o item personalizado do ciclo escolhido.

## Ciclos, integrações e compatibilidade

- Semanal: reutilizar a janela semanal já carregada e o servidor `saveWeeklyGoal`.
- Mensal: reutilizar a janela mensal configurável e o servidor `saveMonthlyGoal`, sem mudar o dia de início existente.
- Importar/aplicar não pode alterar automaticamente a configuração de início do ciclo, criar outro ciclo ou substituir o ciclo ativo.
- Painel e relatórios atuais devem continuar funcionando sem regressões. Não se adiciona telemetria automática de atividades personalizadas: esse progresso é manual e aparece na página de metas; as métricas fixas continuam calculadas normalmente nos demais lugares.
- A gravação da meta fixa e da coleção personalizada do mesmo ciclo deve ocorrer atomicamente, sem salvar só parte do rascunho.

## Falhas e estados

O componente deve distinguir: nenhum arquivo, processando, rascunho pronto, extração sem texto, PDF inválido, arquivo acima do limite, erro de leitura e salvamento pendente/concluído/falhou. Cancelar ou trocar o PDF descarta o rascunho local anterior. Falha de persistência mantém os valores da revisão na tela para nova tentativa.

Se o PDF trouxer um alvo para métrica conhecida, o alvo pode ser importado, mas seu progresso continua vindo do CRM. Para um item personalizado, progresso só será preenchido se o PDF indicar explicitamente o valor atual de maneira não ambígua; caso contrário começa em zero e pode ser editado na revisão.

## Validação

- Testes unitários do extrator com PDFs textuais de exemplo: aliases conhecidos, metas personalizadas, unidades e moeda/formatação brasileira, documento vazio/sem texto e valores ambíguos.
- Testes unitários para validação/normalização de itens personalizados e proteção contra payload malformado.
- Testes de ações semanais e mensais comprovando preservação dos campos legados, salvamento atômico, autenticação e edição do progresso personalizado.
- Testes end-to-end na página de metas: importar PDF de exemplo, ajustar rascunho, alternar/testar ciclos semanal e mensal, salvar, navegar/atualizar e verificar persistência e edição do progresso.
- Executar testes existentes de metas, `typecheck`, lint, suíte unitária, E2E relevante e build de produção antes de concluir.

## Fora do escopo desta versão

- OCR para PDF escaneado/fotografado.
- Enviar conteúdo do PDF a serviço externo ou modelo de IA.
- Inferir automaticamente progresso de indicadores que não existem no CRM.
- Alterar o relatório histórico ou os cálculos das métricas existentes para representar eventos personalizados.
- Interpretar layouts arbitrários sem revisão humana.
