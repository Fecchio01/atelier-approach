# Vendas por catálogo e follow-up automático no CRM

## Objetivo

Tornar o fechamento de negócios e os retornos comerciais rápidos, consistentes e rastreáveis: a equipe configura os serviços e seus preços uma única vez, escolhe os itens vendidos ao fechar cada empresa, e o CRM calcula venda/MRR. Reabrir um negócio desfaz seu efeito nos indicadores sem apagar o registro da venda. Follow-ups passam a receber uma data automática baseada em um intervalo configurado pela empresa.

## Entendimento confirmado

- O preço dos serviços e o intervalo padrão de follow-up são configurações compartilhadas pela equipe/empresa.
- Um fechamento pode envolver mais de um serviço. Serviços recorrentes alimentam também o MRR.
- Ao sair de “Ganho”, a empresa deixa de contar como venda ativa; o histórico deve permanecer auditável.
- Ao entrar em “Follow-up”, o sistema agenda automaticamente. O padrão inicial é dois dias e a empresa pode alterar esse intervalo.
- O canal da primeira abordagem já é escolhido e registrado quando a empresa é adicionada ao funil pela pesquisa. Não deve haver outro cartão para registrar canal/notas no detalhe do CRM.
- “Fechar negócio”, “Devolver para pesquisa” e “Descartar empresa” devem estar acessíveis no detalhe de contato da empresa.

## Abordagens consideradas

1. Continuar digitando valor e MRR em cada lead — exige repetir dados e facilita divergências.
2. Catálogo compartilhado com itens de venda e snapshots por negócio — permite escolha rápida e preserva exatamente o que foi vendido mesmo que o catálogo mude depois.
3. Cobrar apenas um serviço por venda — mais simples, mas não representa empresas que contratam vários serviços.

**Escolha:** abordagem 2. Ela automatiza a soma, permite combinações e mantém um registro imutável do nome, tipo e preço vendido. A empresa poderá arquivar serviços para impedir novas seleções sem alterar vendas passadas.

## Configurações comerciais

- Adicionar à área de configurações do sistema um espaço compartilhado chamado “Configurações comerciais”.
- O catálogo permite criar, editar e arquivar serviços com nome, preço e tipo: cobrança única ou recorrente mensal.
- O preço de um serviço recorrente representa seu valor mensal. Editar ou arquivar um item afeta somente fechamentos futuros; vendas já feitas conservam seus snapshots.
- Configurar o intervalo padrão de follow-up como número inteiro positivo de dias, com padrão inicial de 2.
- A alteração do intervalo aplica-se aos próximos agendamentos automáticos; não muda datas de follow-ups já existentes.
- Como o sistema atual não possui cadastro de organizações ou papéis administrativos, estas configurações são compartilhadas por todos os usuários autenticados da equipe, como as metas da equipe.

## Fechamento e reabertura de negócio

- No detalhe da empresa, a ação “Fechar negócio” fica na seção “Contato”. Nela, o usuário pode selecionar um ou mais serviços ativos do catálogo e ver a soma antes de confirmar.
- O total dos itens selecionados grava o valor da venda. A soma dos itens recorrentes também grava o MRR; itens únicos não entram no MRR.
- A seleção de serviços é opcional para manter compatibilidade com fechamentos sem valor conhecido: fechar sem itens continua registrando uma venda, com venda e MRR iguais a zero. A interface informa explicitamente esse resultado.
- O fechamento grava, em uma única transação, a mudança de etapa, o evento de venda e os snapshots dos itens selecionados, além do histórico existente. A ação não pode criar dois eventos numa repetição ou clique duplicado.
- Os campos financeiros manuais existentes continuam disponíveis para corrigir vendas legadas ou situações sem item de catálogo, sem criar outra venda; o ajuste deve continuar registrado no histórico.
- Ao mover um lead de “Ganho” para qualquer outra etapa, a venda ativa recebe data e responsável pela reversão. O lead deixa de expor valores atuais de venda/MRR, e a atividade “Venda revertida” explica que o lead foi reaberto. Nenhum evento ou snapshot é apagado.
- Um novo fechamento posterior cria um novo evento e snapshots; vendas anteriores revertidas permanecem no histórico e não voltam a contar.
- A migração reconcilia eventos legados incompatíveis com o estado atual: vendas de leads atualmente fora de “Ganho” são marcadas como revertidas; eventos anteriores à última atividade legada de reabertura também são marcados. A reconciliação conserva valores e datas originais.

## Follow-up automático

- Ao entrar em “Follow-up”, o servidor consulta o intervalo configurado e agenda para esse número de dias após a transição, preservando o mesmo horário local da ação. A data é calculada no servidor e persistida em UTC.
- Uma transição cria ou substitui o follow-up pendente da empresa dentro da mesma transação e registra a atividade de agendamento. Não cria duplicatas em chamadas repetidas.
- O detalhe mostra a data atual do retorno. Reagendamento manual explícito continua disponível como exceção; ao reagendar, o sistema registra o cancelamento do vencimento anterior e a criação do novo.
- O cartão separado “Canal da atividade / Nota da atividade / Registrar contato” é removido. O canal segue sendo escolhido na inclusão da empresa pela pesquisa; o histórico conserva as atividades automáticas e os contatos existentes.
- Os controles de mudança de etapa, fechamento, devolução à pesquisa e descarte ficam reunidos em “Contato”. O histórico segue separado. Nenhuma lógica de devolução ou descarte é removida.

## Persistência, métricas e relatórios

- Estender a persistência atual com catálogo de serviços, snapshots de itens por venda e campos opcionais de reversão em `SaleEvent`. Guardar preço em decimal monetário no banco e validar valores não negativos.
- Adicionar configuração compartilhada para intervalo padrão de follow-up (default 2 dias).
- Toda consulta de vendas ativas — painel, metas automáticas, ciclo semanal/mensal, canais e relatórios — considera somente eventos sem reversão. Os valores de receita, quantidade de vendas, conversão e MRR são recalculados sem o evento revertido.
- Relatórios diários já fechados permanecem snapshots imutáveis, conforme a semântica existente. Uma reversão posterior aparece no histórico do CRM e afeta os indicadores dinâmicos e relatórios semanal/mensal; ela não reescreve o PDF de um dia já fechado. O snapshot de um dia ainda aberto registra a reversão quando esse dia for fechado.
- A reversão e sua atualização financeira são registradas como atividades auditáveis; a lista de atividades não serve como substituta do estado reversível estruturado do evento de venda.
- Migração Prisma/PostgreSQL aditiva: não apagar eventos, atividades, snapshots nem serviços históricos. Itens de venda devem continuar legíveis mesmo depois de um serviço ser arquivado.

## Validação e falhas

- Validar seleção contra IDs existentes e ativos, quantias monetárias finitas e não negativas, tipos de serviço válidos e intervalo como inteiro positivo.
- A transação do fechamento garante que etapa, evento e snapshots sejam gravados juntos ou nenhum deles seja gravado.
- Se não houver serviço ativo cadastrado, a interface explica como cadastrá-lo e ainda permite registrar fechamento sem valor, deixando venda/MRR em zero; não inventa receita.
- Se a configuração não estiver persistida ainda, usar dois dias como valor seguro padrão.
- Erros de rede ou validação mantêm o modal aberto, preservam as escolhas e mostram mensagem clara para nova tentativa.

## Critérios de aceite

1. Cadastrar serviço único e recorrente, editar e arquivar serviços; arquivados não aparecem em novos fechamentos e itens históricos mantêm nome/preço/tipo originais.
2. Fechar com dois ou mais serviços calcula o total da venda como soma dos preços e o MRR como soma apenas dos recorrentes; fechar sem item conta uma venda com valores zero.
3. Reabrir lead ganho marca seu evento como revertido, limpa valores atuais, mantém o histórico e remove a venda/receita/MRR/conversão dos indicadores dinâmicos, sem duplicar ou apagar eventos.
4. Fechar novamente após reabertura cria um novo evento ativo; a venda anterior permanece revertida.
5. Eventos legados de leads atualmente reabertos deixam de inflar métricas após a migração, com seus valores e ocorrência preservados.
6. Configurar intervalo padrão para 3 dias faz a próxima transição agendar automaticamente para três dias depois; novo valor não altera follow-ups antigos; reagendar manualmente continua funcionando.
7. Repetir uma transição em `FOLLOW_UP` não gera follow-ups pendentes duplicados; o histórico registra agendamento e reagendamento.
8. A aba “Contato” apresenta fechamento, mudança de etapa, devolução e descarte; não mostra o cartão redundante de nota/canal. Canal da abordagem continua registrado ao adicionar empresa pela pesquisa.
9. Relatórios semanais/mensais, painel e metas excluem vendas revertidas; snapshots diários já fechados não mudam, e a reversão entra no snapshot diário se ele ainda não tiver sido fechado.
10. Testes unitários, integração Prisma/API, typecheck, lint, jornadas E2E desktop/mobile e build de produção cobrem os casos acima antes da publicação no GitHub/Vercel.

## Escopo técnico previsto

- `prisma/schema.prisma` e nova migração PostgreSQL.
- API autenticada de serviços/configurações comerciais e `app/api/leads/[id]/route.ts`.
- `components/lead-detail-modal.tsx` e os dados carregados por `app/(app)/crm/page.tsx` / `components/kanban-board.tsx`.
- Consulta/projeção de venda ativa em `lib/metrics.ts`, `lib/reports.ts`, painel e endpoints/exportação de relatórios.
- Testes de domínio, API, relatórios, CRM e jornadas mobile/desktop.

## Fora de escopo

- Cobrança, faturas, pagamentos ou integração contábil; o catálogo registra preços e vendas no CRM, não processa dinheiro.
- Catálogos diferentes por usuário, unidade ou organização — o sistema ainda não possui esse modelo.
- Remoção de venda, item vendido ou atividade do histórico por exclusão física.
- Mudança nos nomes/etapas do funil, regras de reuniões, metas importadas por PDF ou layout geral da marca.
