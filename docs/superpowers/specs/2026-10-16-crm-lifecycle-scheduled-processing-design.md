# Processamento agendado do ciclo de vida do CRM — especificação

## Objetivo

Fazer com que as regras atuais de follow-up, descarte por inatividade e retenção da Lixeira sejam processadas pelo servidor mesmo quando ninguém abre o Painel ou o CRM. O agendamento não altera os prazos nem os critérios já aprovados; apenas garante uma oportunidade diária de processamento independente da navegação da equipe.

## Regras existentes que permanecem

1. Uma empresa em `CONTACTED` (Abordado) sem avanço entra em `FOLLOW_UP` após dois dias na etapa.
2. Uma empresa em `PROPOSAL` (Proposta enviada) sem avanço entra em `FOLLOW_UP` após cinco dias na etapa.
3. Concluir o follow-up restaura a empresa à etapa de origem e inicia, naquele instante, o prazo de cinco dias sem avanço. Ao completar o prazo, ela é movida automaticamente para `DISCARDED`.
4. Uma empresa permanece sete dias na Lixeira antes da exclusão permanente.

Os prazos são durações corridas de 24 horas, calculadas com timestamps persistidos no servidor. O processamento pode ocorrer depois do instante exato de vencimento; não antecipa uma transição.

## Comportamento agendado

- Configurar uma execução diária do Vercel Cron às 03:00 UTC (meia-noite em São Paulo), por meio de uma rota interna GET.
- A rota invoca o processador já usado pelo Painel e pelo CRM. Não deve haver uma segunda implementação de regras nem diferenças de resultado entre o processamento agendado e o acionado ao abrir essas páginas.
- Preservar o processamento no Painel e no CRM como recuperação imediata quando alguém abrir essas áreas. A execução agendada complementa esse mecanismo; não o substitui.
- A execução diária processa todos os itens vencidos, inclusive atrasados por dias, em vez de processar apenas os que venceram desde a execução anterior.
- Manter o escopo multi-equipe já adotado pelo processador: não limitar a rotina ao usuário que iniciou a sessão ou a um proprietário individual do lead.
- Não criar alarmes do celular, notificações push, e-mails ou mensagens externas. Os avisos existentes continuam aparecendo dentro do Painel.

## Autorização e privacidade

- A rota não depende de sessão de usuário, mas exige um segredo de serviço configurado como variável de ambiente (`CRON_SECRET`) e valida o cabeçalho `Authorization: Bearer <segredo>` antes de consultar ou alterar dados.
- Requisições sem segredo ou com segredo inválido retornam `401` e não iniciam processamento. O segredo nunca aparece no corpo, logs ou mensagens de erro.
- A resposta de sucesso informa apenas contagens operacionais (itens movidos a Follow-up, descartados e permanentemente excluídos); não inclui nomes, telefones, e-mails ou outros dados de empresas.
- Registrar falhas no log do servidor com contexto suficiente para diagnóstico, sem incluir segredos nem dados pessoais desnecessários.

## Idempotência, concorrência e falhas

- Uma chamada repetida, simultânea ou atrasada não deve criar follow-ups, atividades ou transições duplicadas, nem descartar um lead que a equipe já avançou para outra etapa.
- Reutilizar as verificações condicionais/transacionais do processador existente para proteger alterações concorrentes feitas por pessoas no CRM.
- Se uma execução falhar, não tentar compensar com mudanças destrutivas; deixar o estado consistente e registrar a falha. A próxima abertura do Painel/CRM ou execução diária deve alcançar todos os vencimentos ainda válidos.
- O Vercel Cron não é tratado como uma fila com repetição garantida. Uma execução perdida ou com falha será recuperada pelo próximo processamento, sem depender de uma repetição imediata da plataforma.
- Preservar a proteção existente contra exclusão antecipada: somente registros atualmente em `DISCARDED` e com `discardedAt` de pelo menos sete dias podem ser removidos permanentemente. Registros sem data confiável não podem ser apagados por estimativa.

## Configuração e operação

- Adicionar a rota ao `vercel.json` com a expressão diária correspondente a 03:00 UTC.
- Configurar `CRON_SECRET` nos ambientes Vercel necessários e no ambiente usado para validação da rota. Nenhum valor de segredo será versionado.
- Se a variável estiver ausente, a rota deve falhar fechada; não aceitar chamadas sem autenticação como fallback.
- Não adicionar serviços pagos, novas tabelas, novas dependências ou uma interface de configuração de horários nesta entrega.
- A precisão diária é suficiente para as regras em dias. O horário de execução pode variar dentro da janela permitida pelo plano Vercel; a rotina deve sempre comparar timestamps e processar atrasados corretamente.

## Critérios de aceite

1. A configuração registra uma chamada diária à rota às 03:00 UTC.
2. Uma chamada sem autenticação válida não altera o banco e retorna `401`.
3. Uma chamada autenticada executa o mesmo processador usado no Painel/CRM e retorna somente contagens de resultado.
4. Testes confirmam que os limites existentes continuam sendo: 2 dias em Abordado, 5 dias em Proposta enviada, 5 dias após conclusão do Follow-up e 7 dias na Lixeira.
5. Leads vencidos durante um período sem visitas são processados na próxima execução; nenhum lead é alterado antes do vencimento.
6. Repetir ou concorrer chamadas não duplica Follow-ups, atividades ou histórico, e não descarta leads que já avançaram manualmente.
7. Falha ou ausência do cron não impede que o Painel/CRM faça catch-up nem permite excluir antes dos 7 dias.
8. Avisos permanecem internos ao Painel; nenhuma notificação externa é enviada.

## Fora de escopo

- Mudar os intervalos, etapas elegíveis, comportamento de confirmação ou política de retenção existentes.
- Criar notificações externas, alarme no dispositivo, e-mail, WhatsApp, SMS ou push.
- Garantir execução em minuto exato ou em tempo real. No plano Hobby, os cron jobs têm no máximo uma execução por dia e podem iniciar em qualquer momento dentro da hora agendada; maior frequência depende do plano Vercel disponível.
- Alterar a UI de Follow-ups, Ações pendentes, avisos do Painel ou o funil.
- Fazer mudanças em dados existentes, restaurar empresas ou apagar registros durante implantação.
