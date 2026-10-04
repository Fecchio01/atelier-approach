# Vendas por catálogo e follow-up automático — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar serviços e prazo padrão uma vez, calcular valores ao fechar negócio, reverter vendas sem apagar auditoria e agendar follow-ups automaticamente.

**Architecture:** Adicionar catálogo e configurações comerciais compartilhadas, salvar snapshots por venda e marcar eventos revertidos em vez de excluí-los. Atualizar projeções de receita/MRR para ignorar eventos revertidos; manter snapshots diários fechados imutáveis. O CRM consome catálogo e intervalo das configurações, remove o cartão redundante de contato e concentra as ações comerciais na aba “Contato”.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Vitest, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-04-crm-vendas-servicos-followup-design.md`

## Global Constraints

- Como o sistema atual não possui cadastro de organizações ou papéis administrativos, estas configurações são compartilhadas por todos os usuários autenticados da equipe, como as metas da equipe.
- O preço de um serviço recorrente representa seu valor mensal. Editar ou arquivar um item afeta somente fechamentos futuros; vendas já feitas conservam seus snapshots.
- Configurar o intervalo padrão de follow-up como número inteiro positivo de dias, com padrão inicial de 2.
- A alteração do intervalo aplica-se aos próximos agendamentos automáticos; não muda datas de follow-ups já existentes.
- A seleção de serviços é opcional para manter compatibilidade com fechamentos sem valor conhecido: fechar sem itens continua registrando uma venda, com venda e MRR iguais a zero. A interface informa explicitamente esse resultado.
- Ao mover um lead de “Ganho” para qualquer outra etapa, a venda ativa recebe data e responsável pela reversão. O lead deixa de expor valores atuais de venda/MRR, e a atividade “Venda revertida” explica que o lead foi reaberto. Nenhum evento ou snapshot é apagado.
- Toda consulta de vendas ativas — painel, metas automáticas, ciclo semanal/mensal, canais e relatórios — considera somente eventos sem reversão. Os valores de receita, quantidade de vendas, conversão e MRR são recalculados sem o evento revertido.
- Relatórios diários já fechados permanecem snapshots imutáveis, conforme a semântica existente.
- O total dos itens selecionados grava o valor da venda. A soma dos itens recorrentes também grava o MRR; itens únicos não entram no MRR.
- Reagendamento manual explícito continua disponível como exceção.
- O canal segue sendo escolhido na inclusão da empresa pela pesquisa; o histórico conserva as atividades automáticas e os contatos existentes.
- “Fechar negócio”, “Devolver para pesquisa” e “Descartar empresa” devem estar acessíveis no detalhe de contato da empresa.

## Review Focus

- Clique repetido ou PATCH concorrente ao fechar/reabrir: exatamente um evento ativo por fechamento e nenhum snapshot parcial. Testar na Task 2.
- Serviços inexistentes/arquivados, preço malformado/negativo ou ausência de serviço: rejeitar seleção inválida sem gravação parcial; fechamento vazio continua gerando zero. Testar nas Tasks 1 e 2.
- Lead com venda antiga, reabertura, novo fechamento e eventos legados: preservar snapshots, excluir apenas vendas revertidas e não contar legado incorretamente. Testar nas Tasks 1–3.
- Mistura de itens únicos e recorrentes com valores decimais: venda soma todos os preços e MRR somente os recorrentes, sem erro de centavos. Testar na Task 1 e no fluxo E2E da Task 5.
- Configuração de prazo ausente/inválida, alteração com lembretes já agendados e transição repetida: usar 2 dias como fallback, não alterar pendências antigas e impedir duplicatas. Testar na Task 4.

---

### Task 1: Persistência, catálogo de serviços e configurações comerciais

**Files:**
- Modify: `prisma/schema.prisma` — `ServiceBillingType`, `ActivityType.SALE_REVERSED`, catálogo, snapshots de venda, reversão e configuração compartilhada de CRM.
- Create: `prisma/migrations/20261004000000_crm_service_catalog_reversible_sales/migration.sql` — migração aditiva e reconciliação legada.
- Create: `lib/service-sales.ts` — totais monetários puros.
- Create: `lib/commercial-settings.ts` — acesso compartilhado e fallback do prazo padrão de follow-up.
- Create: `app/api/services/route.ts` e `app/api/services/[id]/route.ts` — CRUD autenticado; exclusão lógica/arquivamento.
- Create: `app/api/commercial-settings/route.ts` — ler e salvar `followUpDelayDays`.
- Test: `tests/unit/service-sales.test.ts`, `tests/unit/service-routes.test.ts`, `tests/unit/commercial-settings.test.ts`.

**Interfaces:**
- Produz: `summarizeServiceItems(items: readonly { price: string | number; billingType: 'ONE_TIME' | 'MONTHLY' }[]): { saleValue: number; mrr: number }` soma centavos inteiros; itens mensais contam em `saleValue` e `mrr`, únicos somente em `saleValue`.
- Produz: `getFollowUpDelayDays(database = prisma): Promise<number>` retorna o valor salvo ou 2 quando a configuração ainda não existe.
- Produz: `GET /api/services` lista ativos; `POST` cria; `PATCH /api/services/[id]` edita ou arquiva via `isActive: false`. Item arquivado não é removido fisicamente.
- Produz: `GET /api/commercial-settings` sempre retorna `followUpDelayDays` com fallback 2; `PATCH` aceita somente inteiro positivo.
- Produz: `SaleEvent.reversedAt` e `reversedById` opcionais; `SaleLineItem` guarda cópia imutável do serviço, preço e tipo; `ActivityType.SALE_REVERSED`; `CrmSettings` é singleton compartilhado com `followUpDelayDays @default(2)`.
- Produz: a migração marca como revertidas vendas legadas de leads atualmente fora de `WON` e eventos anteriores à última atividade legada de reabertura, sem apagar dados ou alterar datas/valores originais.

- [ ] **Step 1: Escrever testes RED** — testar a soma de itens únicos/recorrentes incluindo centavos; CRUD exige autenticação, valida preço/tipo/nome, omite arquivados e arquivar não exclui; configuração ausente retorna 2 e PATCH rejeita zero, fração e string inválida.
- [ ] **Step 2: Confirmar falha** — executar `npx vitest run tests/unit/service-sales.test.ts tests/unit/service-routes.test.ts tests/unit/commercial-settings.test.ts`; falhar especificamente por modelos, rotas e cálculo inexistentes.
- [ ] **Step 3: Implementar schema e migração** — adicionar os enums/modelos e relações especificados; usar tipo decimal PostgreSQL para preços e valores. Gerar/adicionar a migração sem apagar dados; marcar vendas legadas inconsistentes usando estado de etapa e histórico `LEAD_REOPENED`.
- [ ] **Step 4: Implementar cálculo e APIs** — implementar `summarizeServiceItems`, validação monetária, rotas autenticadas de catálogo e configuração, com arquivamento lógico e fallback de 2 dias.
- [ ] **Step 5: Verificar GREEN** — rodar os três arquivos Vitest, `npx prisma validate` e `npx prisma generate`; novos testes passam e os modelos gerados são válidos. A migração deve ser validada executando-a em banco de teste isolado na Task 6; não verificar DDL por asserções de texto.
- [ ] **Step 6: Commit** — `feat: add commercial service catalog and settings`.

### Task 2: Fechamento e reversão transacionais

**Files:**
- Modify: `app/api/leads/[id]/route.ts` — aceitar `serviceIds`, calcular e salvar venda e snapshots, reverter venda ativa ao sair de `WON`.
- Modify: `prisma/schema.prisma` / migration from Task 1 only if required by the tested relation (do not introduce a second competing migration).
- Modify: `tests/unit/lead-routes.test.ts` — contratos de fechamento, valores, reversão e idempotência.

**Interfaces:**
- Consome: `summarizeServiceItems` e modelos `ServiceCatalogItem`, `SaleEvent`, `SaleLineItem` da Task 1.
- Produz: `PATCH /api/leads/[id]` aceita `{ stage: 'WON', serviceIds?: string[] }`; IDs informados devem ser ativos e válidos. Omitir/vazio mantém fechamento em zero para compatibilidade; valores manuais permanecem aceitos para ajustes em venda já ganha.
- Produz: ao sair de `WON`, a transação marca o evento ativo mais recente com `reversedAt`/`reversedById`, limpa os valores atuais do lead e registra atividade `SALE_REVERSED`; não apaga venda nem snapshots.
- Produz: re-fechar depois de reabrir cria um novo `SaleEvent`; um fechamento repetido sem transição não cria outro evento.

- [ ] **Step 1: Escrever testes RED** — adicionar casos em `lead-routes.test.ts`: soma e snapshots de vários serviços; misto mensal/único; recusa de ID inexistente/arquivado sem escrita; fechar sem serviço com valores zero; reabrir marca venda/ator/data e registra auditoria sem apagar snapshots; fechar novamente cria novo evento; request repetido não duplica evento.
- [ ] **Step 2: Confirmar falha** — `npx vitest run tests/unit/lead-routes.test.ts`; casos novos devem falhar pela ausência de seleção de serviços e reversão persistida.
- [ ] **Step 3: Implementar fechamento atômico** — dentro da transação com lock do lead, validar todos os serviços ativos, calcular valores, criar `SaleEvent` e snapshots e atualizar etapa/histórico; invalidar tudo junto se uma validação falhar.
- [ ] **Step 4: Implementar reversão auditável** — ao mover de `WON` para qualquer outra etapa, reverter o evento ativo, zerar os valores atuais do lead, cancelar follow-ups pendentes conforme o fluxo atual e gravar `SALE_REVERSED` sem remover atividades ou linha vendida.
- [ ] **Step 5: Verificar GREEN** — rodar `npx vitest run tests/unit/lead-routes.test.ts tests/unit/service-routes.test.ts`; verificar que a venda antiga não volta a contar após novo fechamento.
- [ ] **Step 6: Commit** — `feat: close and reopen service sales with audit history`.

### Task 3: Excluir vendas revertidas das métricas dinâmicas

**Files:**
- Modify: `lib/metrics.ts` — tipo/projeção `MetricSaleEvent` e cálculo de metas e painel.
- Modify: `lib/reports.ts` — sumarização diária aberta e ciclos semanais/mensais.
- Modify: `app/(app)/page.tsx` e `app/api/reports/route.ts` — consultas ativas usadas pelo painel e exportações.
- Modify: `tests/unit/metrics.test.ts`, `tests/unit/reports.test.ts`, `tests/unit/daily-reports.test.ts`.

**Interfaces:**
- Consome: campo `SaleEvent.reversedAt` da Task 1.
- Produz: todas as projeções dinâmicas consomem apenas eventos cujo `reversedAt` é `null`; venda, receita, MRR, conversão, canal e metas usam o mesmo conjunto.
- Produz: snapshots diários já salvos seguem inalterados; a construção de snapshot de dia aberto exclui reversões já registradas até o fechamento.

- [ ] **Step 1: Escrever testes RED** — `metrics.test.ts`: venda revertida não incrementa venda/receita/MRR/conversão; outra venda ativa do mesmo lead permanece contável. `reports.test.ts`: semanal/mensal e exportação omitem evento revertido e mantêm o evento de reversão no histórico de ações. `daily-reports.test.ts`: snapshot existente não muda e novo snapshot aberto respeita estado revertido.
- [ ] **Step 2: Confirmar falha** — `npx vitest run tests/unit/metrics.test.ts tests/unit/reports.test.ts tests/unit/daily-reports.test.ts`; asserts devem falhar porque SaleEvent hoje é incluído sem filtro.
- [ ] **Step 3: Implementar filtro central** — filtrar na consulta Prisma e na projeção pura `reversedAt === null`; manter fallback legado somente para lead ainda `WON` sem eventos de venda.
- [ ] **Step 4: Verificar GREEN** — executar os três arquivos Vitest e confirmar agregados de dashboard, metas, relatórios, canal e PDFs com dados de venda revertida.
- [ ] **Step 5: Commit** — `fix: exclude reversed sales from live reports`.

### Task 4: Prazo padrão e agendamento automático de follow-up

**Files:**
- Create: `lib/follow-up-scheduling.ts` — cálculo puro da data de vencimento.
- Modify: `app/api/leads/[id]/route.ts` — usar configuração ao mudar para `FOLLOW_UP`; manter ação explícita de reagendar.
- Consume: `lib/commercial-settings.ts` — acesso tipado ao prazo com fallback criado na Task 1.
- Test: `tests/unit/follow-up-scheduling.test.ts`, `tests/unit/lead-routes.test.ts`, `tests/unit/commercial-settings.test.ts`.

**Interfaces:**
- Produz: `getFollowUpDueDate(now: Date, delayDays: number): Date` acrescenta `delayDays * 24h`, preservando a hora local equivalente e retornando uma data UTC válida.
- Produz: `PATCH { stage: 'FOLLOW_UP' }` agenda usando a configuração compartilhada, sem exigir `followUpAt`; `followUpAction: 'RESCHEDULE'` continua exigindo uma data válida fornecida pelo usuário.
- Produz: uma transição troca eventual follow-up pendente anterior por um novo dentro da mesma transação; PATCH repetido sem transição não cria outro.

- [ ] **Step 1: Escrever testes RED** — testar cálculo para 2 e 3 dias, limite de mês/ano e entrada inválida; testar transição sem data usando o prazo configurado, fallback 2, substituição de pendência existente, não alterar pendências quando configuração muda e reagendamento manual ainda funcionar.
- [ ] **Step 2: Confirmar falha** — `npx vitest run tests/unit/follow-up-scheduling.test.ts tests/unit/lead-routes.test.ts tests/unit/commercial-settings.test.ts`; transição sem data deve falhar no comportamento atual.
- [ ] **Step 3: Implementar agendamento** — carregar setting em transação ou serviço compartilhado, calcular no servidor, cancelar anterior e gravar novo follow-up e atividade atomicamente.
- [ ] **Step 4: Verificar GREEN** — executar os três arquivos Vitest e confirmar classificação de atrasado/hoje nos testes existentes `tests/unit/metrics.test.ts`.
- [ ] **Step 5: Commit** — `feat: schedule follow-ups from shared company interval`.

### Task 5: Configurações e modal do CRM em desktop/mobile

**Files:**
- Create: `components/commercial-settings-form.tsx` — formulário de catálogo e intervalo.
- Modify: `app/(app)/configuracoes/page.tsx` — carregar e exibir configurações comerciais junto às existentes.
- Modify: `app/(app)/crm/page.tsx` e `components/kanban-board.tsx` — fornecer catálogo ativo e intervalo ao modal.
- Modify: `components/lead-detail-modal.tsx` — fechar negócio com escolha de serviços em “Contato”, consolidar ações e remover cartão/tab de atividade redundante.
- Modify: `tests/e2e/crm-modal.spec.ts`; Create: `tests/e2e/commercial-sales-follow-up.spec.ts`.

**Interfaces:**
- Consome: rotas `/api/services`, `/api/services/[id]`, `/api/commercial-settings`, totais e semântica da Task 2, cálculo automático da Task 4.
- Produz: “Configurações comerciais” permite adicionar/editar/arquivar serviços e ajustar dias; a interface mostra feedback de erro/sucesso e mantém formulários utilizáveis em mobile.
- Produz: fechamento lista serviços ativos e atualiza total e MRR antes da confirmação; fechar sem itens mostra que os valores ficarão zero. Lead ganho exibe valores e mantém correção manual legada.
- Produz: a aba “Contato” contém mudança de etapa, fechamento, follow-up/reagendamento, devolução e descarte. A opção genérica de etapa não contorna a ação de fechamento; “Ganho” só é acessível pelo fechamento. Aba “Histórico” permanece e mostra reversão.
- Produz: canal continua selecionado no cartão de pesquisa ao adicionar empresa; não existe mais cartão “Canal da atividade / Nota da atividade / Registrar contato”.

- [ ] **Step 1: Escrever testes E2E RED** — provar administração de catálogo e prazo; fechar com item mensal e único e conferir venda/MRR calculados; fechar sem item; reabrir e conferir ausência nos indicadores; registrar follow-up sem data e conferir vencimento; conferir retorno/descarte; testar viewport mobile e ausência do cartão redundante.
- [ ] **Step 2: Confirmar falha** — `npx playwright test tests/e2e/commercial-sales-follow-up.spec.ts tests/e2e/crm-modal.spec.ts`; novos elementos e fluxos não devem estar presentes antes da implementação.
- [ ] **Step 3: Implementar configurações** — carregar dados no servidor, adicionar formulário de gestão comercial com inclusão/edição/arquivamento e ajuste de intervalo; apresentar preços em BRL e validação acessível.
- [ ] **Step 4: Implementar modal** — mover ação de fechamento para contato, permitir seleção múltipla e resumo de valores, retirar aba/cartão redundantes, manter ações de devolução/descarte e reagendamento; renderizar mensagens da API sem perder escolhas.
- [ ] **Step 5: Verificar GREEN** — executar ambos os E2E em desktop e mobile; executar também `npx playwright test tests/e2e/crm-to-dashboard.spec.ts tests/e2e/daily-close.spec.ts` para validar integrações com painel e relatórios.
- [ ] **Step 6: Commit** — `feat: streamline CRM sales and follow-up controls`.

### Task 6: Verificação integrada e publicação

**Files:**
- Verify: migrations, APIs, métricas, telas e testes das Tasks 1–5; corrigir somente falhas relacionadas à especificação.
- Modify: `README.md` — corrigir a instrução obsoleta que classifica as migrações PostgreSQL atuais do Prisma como legadas/SQLite.

- [ ] **Step 1: Testes unitários** — executar `npm test`; esperado: toda a suíte Vitest passa. Registrar e corrigir falhas introduzidas pela mudança.
- [ ] **Step 2: Qualidade estática** — executar `npm run typecheck`, `npm run lint` e `git diff --check`; esperado: sem erros.
- [ ] **Step 3: E2E completo relevante** — executar `npx playwright test tests/e2e/commercial-sales-follow-up.spec.ts tests/e2e/crm-modal.spec.ts tests/e2e/crm-to-dashboard.spec.ts tests/e2e/daily-close.spec.ts tests/e2e/mobile-responsiveness.spec.ts`; esperado: fluxos sem regressão em mobile e desktop.
- [ ] **Step 4: Build** — executar `npm run build`; esperado: compilação de produção com schema e rota de banco atualizados.
- [ ] **Step 5: Conferir migrações em banco de teste** — confirmar que a URL-alvo usa somente o schema isolado `atelier_test`; aplicar as migrações Prisma pendentes nesse schema e verificar colunas, tipos, índices e reconciliação de vendas legadas com fixtures. Não resetar nem limpar outro schema.
- [ ] **Step 6: Conferir e migrar produção** — verificar status e schema Supabase de produção; aplicar as migrações Prisma aditivas pendentes na ordem e validar os novos campos sem reescrever snapshots diários nem apagar dados.
- [ ] **Step 7: Publicar** — revisar diff/segredos, enviar commits da feature ao GitHub e promover a versão validada para produção no Vercel, conforme preferência já registrada; abrir a URL de produção e fazer smoke test de login, configurações comerciais, fechamento/reabertura e follow-up.

## Handoff

As Tasks 1–4 compartilham modelos e contratos de API; a Task 5 consome todos. A execução nativa em sequência é recomendada para manter transação, migração e projeções consistentes. Uma revisão independente ao final deve dar foco à reconciliação de eventos de venda legados e aos relatórios diários fechados.
