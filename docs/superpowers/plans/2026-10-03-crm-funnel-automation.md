# CRM, Funil e Metas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar reuniões de follow-ups, simplificar o registro de vendas, tornar lembretes visíveis no painel e alinhar metas personalizadas aos indicadores da equipe.

**Architecture:** Manter o enum legado no banco e normalizar `NEW` para `CONTACTED` na camada de domínio. O CRM registra uma venda imediatamente com valores financeiros zerados quando omitidos, permite complementá-los na venda existente com auditoria, e os relatórios derivam reuniões e follow-ups de eventos distintos. Metas personalizadas mantêm o progresso manual legado e podem selecionar uma fonte explícita de métricas do CRM.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-crm-funnel-automation-design.md`

## Global Constraints

- Usar o fuso `America/Sao_Paulo` para classificar follow-ups por data.
- Manter `NEW` como valor legado persistido; apresentá-lo e contabilizá-lo como `CONTACTED` sem reescrever histórico.
- Manter snapshots diários fechados imutáveis.
- Quando valores financeiros não forem informados no fechamento, não inventar receita/MRR; permitir complementação posterior sem duplicar a venda.
- Metas antigas sem origem e metas importadas de PDF devem continuar manuais; nunca inferir origem apenas pelo nome.
- Não publicar em produção nesta entrega.

## Review Focus

- Lead legado em `NEW`, inclusive em contagens agrupadas do painel: verificar que aparece em “Abordado” e que `NEW` não é um destino de atualização.
- Venda fechada sem valores, valores malformados/negativos e complementação posterior: verificar que há exatamente um evento de venda, follow-ups pendentes são cancelados e apenas valores válidos são auditados.
- Lead reaberto e ganho novamente: verificar que a venda anterior permanece e a complementação financeira altera somente a venda atual, sem apagar eventos.
- Follow-ups no limite do dia em São Paulo, concluídos/cancelados e várias datas futuras: verificar categorias corretas, próximos cinco ordenados, sem duplicar lembretes nem inflar reuniões.
- JSON legado/PDF sem `source`, além de troca entre origem automática e manual: verificar que o progresso manual é preservado e nenhuma fonte é adivinhada.

---

### Task 1: Compatibilidade do banco e semântica das etapas

**Files:**
- Modify: `prisma/schema.prisma` — enum `LeadStage`, enum `ActivityType` e default de `Lead.stage`.
- Create: `prisma/migrations/20261003000000_crm_funnel_meetings_sale_financial_audit/migration.sql` — adicionar os valores de enum `MEETING` e `SALE_FINANCIALS_UPDATED` e mudar somente o default de `Lead.stage` para `CONTACTED`.
- Modify: `lib/funnel.ts` — estágios operacionais, normalização legada e classificação de reunião.
- Modify: `components/kanban-board.tsx` — renderizar as sete etapas operacionais sem a coluna “Novo”, incluindo “Reunião”.
- Modify: `app/(app)/page.tsx` — normalizar também as contagens agregadas do funil do painel.
- Modify: `app/api/leads/[id]/route.ts` — rejeitar `NEW` como destino sem rejeitar registros persistidos com esse valor.
- Test: `tests/unit/funnel.test.ts`, `tests/unit/goal-migrations.test.ts`, `tests/unit/lead-routes.test.ts`, `tests/unit/metrics.test.ts`, `tests/e2e/funnel-labels.spec.ts`.

**Interfaces:**
- Produz: `mainFunnelStages` contém `CONTACTED`, `IN_CONVERSATION`, `QUALIFIED`, `PROPOSAL`, `MEETING`, `FOLLOW_UP`, `WON`, nessa ordem.
- Produz: `normalizeFunnelStage('NEW')` retorna `CONTACTED`; `normalizeFunnelStage('INTEREST')` continua retornando `IN_CONVERSATION`; `isMeetingStage` só retorna verdadeiro para `MEETING`.
- Produz: novas criações continuam usando `CONTACTED`; a migração não atualiza linhas existentes nem remove valores do enum.

- [ ] **Step 1: Escrever testes que falham para a nova lista e compatibilidade legada** — atualizar `orders the seven operational funnel stages`, adicionar testes de normalização/contabilização de `NEW` como `CONTACTED`, `INTEREST` como `IN_CONVERSATION`, reunião apenas em `MEETING`, rejeição de destino `NEW` e assertions SQL para os dois valores de enum e o default.
- [ ] **Step 2: Confirmar a falha** — executar `npx vitest run tests/unit/funnel.test.ts tests/unit/goal-migrations.test.ts tests/unit/lead-routes.test.ts`; os novos testes devem falhar pela lista, semântica de reunião, aceitação de `NEW` e ausência da migração.
- [ ] **Step 3: Implementar o contrato** — atualizar schema e criar a migração sem `UPDATE` de dados; ajustar `lib/funnel.ts`, kanban, contagem agregada do painel e validação de destino da rota.
- [ ] **Step 4: Verificar a tarefa** — executar `npx vitest run tests/unit/funnel.test.ts tests/unit/goal-migrations.test.ts tests/unit/lead-routes.test.ts tests/unit/metrics.test.ts`, `npx prisma generate`, `npm run typecheck` e `npx playwright test tests/e2e/funnel-labels.spec.ts` com a migração aplicada ao banco isolado `atelier_test`; tudo deve passar e a UI não deve mostrar “Novo”.
- [ ] **Step 5: Commit e push** — salvar apenas os arquivos desta tarefa em um commit `feat: separate meeting stage and normalize legacy leads` e enviar a branch de trabalho.

### Task 2: Fechamento de venda sem bloqueio e complemento auditável

**Files:**
- Modify: `app/api/leads/[id]/route.ts` — valores opcionais ao entrar em `WON`; atualização financeira permitida somente para lead ganho.
- Modify: `components/lead-detail-modal.tsx` — fechar com uma ação e oferecer campos financeiros opcionais após o ganho.
- Modify: `tests/unit/lead-routes.test.ts` — substituir a expectativa de valores obrigatórios e cobrir complementação sem evento duplicado.
- Modify: `tests/e2e/crm-modal.spec.ts` — cobrir o fechamento sem preencher valores e seu complemento opcional.

**Interfaces:**
- Consome: enum `ActivityType.SALE_FINANCIALS_UPDATED` da Task 1.
- Produz: `PATCH /api/leads/[id]` aceita `{ stage: 'WON' }` com campos financeiros omitidos; cada campo informado deve ser número finito e não negativo.
- Produz: enquanto `stage === 'WON'`, um PATCH apenas com `saleValue` e/ou `mrr` atualiza a venda mais recente do lead, os campos ativos no lead e grava uma Activity `SALE_FINANCIALS_UPDATED`; não cria `SaleEvent` adicional.

- [ ] **Step 1: Escrever testes que falham para fechamento e complemento** — converter `requires both sale value and MRR before a lead can be marked as won` em teste de venda aceita sem valores, esperada como `saleValue: 0`, `mrr: 0`, um único `SaleEvent` e cancelamento de follow-ups pendentes; adicionar testes de complemento posterior sem evento duplicado, venda após reabertura, backfill de lead legado ganho sem `SaleEvent`, e rejeição de valores malformados/negativos.
- [ ] **Step 2: Confirmar a falha** — executar `npx vitest run tests/unit/lead-routes.test.ts`; os testes novos devem falhar porque a rota atual exige os dois valores e não reconhece atualização financeira posterior.
- [ ] **Step 3: Implementar transação idempotente** — criar o evento ao entrar em `WON`, preencher ausência com zero, cancelar follow-ups pendentes na mesma transação; quando um lead já ganho recebe valores, atualizar a venda mais recente sem mudar seu identificador ou `occurredAt`. Se um lead legado em `WON` não tiver `SaleEvent`, criar um único evento com `wonAt`/`wonById` originais e os valores finais. Em ambos os casos não incrementar vendas novamente e gravar Activity de auditoria.
- [ ] **Step 4: Atualizar a experiência do modal** — `closeLead` envia somente `{ stage: 'WON' }`; não troca de aba nem bloqueia por ausência de preço. Para empresa ganha, campos opcionais de venda/MRR usam o PATCH financeiro e mostram feedback de salvamento.
- [ ] **Step 5: Verificar a tarefa** — executar `npx vitest run tests/unit/lead-routes.test.ts` e `npx playwright test tests/e2e/crm-modal.spec.ts`; confirmar venda imediata, complemento opcional e ausência de duplicidade.
- [ ] **Step 6: Commit e push** — salvar somente a rota, modal e testes desta tarefa em `feat: allow unpriced wins with audited updates` e enviar a branch.

### Task 3: Contagem de reuniões, relatórios e follow-ups no painel

**Files:**
- Modify: `lib/metrics.ts` — reuniões derivadas exclusivamente de `MEETING`; classificar e ordenar lembretes pendentes futuros.
- Modify: `lib/reports.ts` — usar semântica de reunião atual nos dados semanais/mensais; manter follow-ups separados.
- Modify: `app/(app)/page.tsx` — consultar os próximos follow-ups pendentes e apresentar a terceira lista.
- Modify: `app/(app)/relatorios/page.tsx` — rotular o indicador só como “Reuniões”, separando-o de follow-ups concluídos.
- Modify: `app/(app)/metas/goal-form.tsx` — renomear o indicador fixo “Reuniões e retornos” para “Reuniões”.
- Modify: `tests/unit/metrics.test.ts`, `tests/unit/reports.test.ts`, `tests/e2e/crm-to-dashboard.spec.ts`, `tests/e2e/mobile-responsiveness.spec.ts`.

**Interfaces:**
- Consome: `isMeetingStage` da Task 1 e persistência de follow-ups/venda da Task 2.
- Produz: `DashboardMetrics.upcoming` é uma lista dos cinco follow-ups pendentes futuros mais próximos, em ordem crescente de vencimento; atrasados e de hoje continuam em suas categorias atuais. O painel carrega esses itens por consulta própria com `state: PENDING`, `dueDate >= today.end`, ordem crescente e `take: 5`, sem limitar a consulta de conclusões no período.
- Produz: reuniões contam apenas transições para `MEETING`; eventos `FOLLOW_UP` e conclusões de retorno não contam como reunião.

- [ ] **Step 1: Escrever testes que falham para reuniões e lembretes** — em `metrics.test.ts`, garantir que `MEETING` soma reunião e `FOLLOW_UP` não; verificar os cinco próximos ordenados, excluindo concluídos/cancelados e cobrindo limites de dia em `America/Sao_Paulo`. Em `reports.test.ts`, atualizar o caso de `FOLLOW_UP` histórico para zero reuniões, adicionar transição `MEETING` e confirmar que snapshot diário fechado não muda. Em E2E, substituir o rótulo “Reuniões / retornos” e exigir seção “Próximos”.
- [ ] **Step 2: Confirmar a falha** — executar `npx vitest run tests/unit/metrics.test.ts tests/unit/reports.test.ts`; os asserts de semântica e `upcoming` devem falhar antes da implementação.
- [ ] **Step 3: Implementar projeções** — adicionar `upcoming` ao resultado puro de métricas, ordenar por `dueDate`, e ajustar a consulta do painel para carregar até cinco pendentes futuros mais próximos sem misturar concluídos/cancelados.
- [ ] **Step 4: Atualizar a apresentação** — adicionar lista “Próximos” ao painel, com nome, responsável e data; corrigir rótulos no painel, relatório e meta fixa para “Reuniões” e manter “Follow-ups concluídos” separado.
- [ ] **Step 5: Verificar a tarefa** — executar os testes unitários acima e `npx playwright test tests/e2e/crm-to-dashboard.spec.ts tests/e2e/mobile-responsiveness.spec.ts`; verificar limites de data em `America/Sao_Paulo`, layout móvel e que relatórios diários fechados não mudam.
- [ ] **Step 6: Commit e push** — salvar apenas métricas, páginas e testes desta tarefa em `feat: separate meeting reports and upcoming followups` e enviar a branch.

### Task 4: Fontes automáticas e visual compacto para metas personalizadas

**Files:**
- Modify: `lib/custom-goals.ts` — origem opcional e compatibilidade de JSON antigo.
- Modify: `app/(app)/metas/custom-goal-metrics.tsx` — apresentação alinhada ao indicador de linha/progresso/lápis e edição sob demanda.
- Modify: `app/(app)/metas/goal-form.tsx` — fornecer os resultados reais do período à lista de indicadores.
- Modify: `lib/goal-import-state.ts` — manter metas importadas como manuais.
- Test: `tests/unit/custom-goals.test.ts`, `tests/unit/goal-import-state.test.ts`, `tests/unit/goal-pdf.test.ts`, `tests/unit/goal-actions.test.ts`, `tests/e2e/goals-cycle.spec.ts`, `tests/e2e/mobile-responsiveness.spec.ts`.

**Interfaces:**
- Produz: `CustomGoalSource = 'manual' | GoalMetricKey`; `CustomGoalMetric.source` é opcional no JSON e ausência significa manual.
- Produz: `CustomGoalMetrics` recebe `goals`, `actuals: GoalMetricActuals` e `onChange`; o valor exibido é `goal.current` para origem manual ou `actuals[goal.source]` para origem automática.
- Produz: `getCustomGoalCurrent(goal: CustomGoalMetric, actuals: GoalMetricActuals): number` centraliza essa seleção e é coberta por teste unitário.
- Produz: trocar uma meta entre origem automática e manual mantém o progresso manual armazenado; PDF não associa fonte automaticamente.

- [ ] **Step 1: Escrever testes que falham para fontes e legado** — adicionar testes de parsing para ausência de `source` como manual e origem válida/inválida; testar `getCustomGoalCurrent` para fontes manual e automática, e verificar importação PDF manual e preservação de `current` ao alternar a origem.
- [ ] **Step 2: Confirmar a falha** — executar `npx vitest run tests/unit/custom-goals.test.ts tests/unit/goal-import-state.test.ts tests/unit/goal-pdf.test.ts tests/unit/goal-actions.test.ts`; os novos casos devem falhar por falta de origem e cálculo de progresso.
- [ ] **Step 3: Implementar o modelo de origem** — validar origem como `manual` ou uma chave existente de `GoalMetricKey`; tratar JSON sem origem como manual; preservar `current` como progresso manual e valores de PDF como manual.
- [ ] **Step 4: Implementar cálculo e interface** — calcular valor mostrado pela fonte selecionada, oferecer escolha explícita da fonte, mover edição de nome/unidade/alvo/ícone/progresso para edição pelo lápis e manter a linha compacta com barra/progresso consistente com indicadores fixos.
- [ ] **Step 5: Verificar a tarefa** — executar os testes unitários acima e `npx playwright test tests/e2e/goals-cycle.spec.ts tests/e2e/mobile-responsiveness.spec.ts`; verificar semanal e mensal, edição manual, origem automática, importação PDF e ausência de overflow no mobile.
- [ ] **Step 6: Commit e push** — salvar apenas metas e testes desta tarefa em `feat: add sourced custom goals with compact editing` e enviar a branch.

### Task 5: Verificação integrada

**Files:**
- Test: `tests/unit/lead-routes.test.ts`, `tests/unit/funnel.test.ts`, `tests/unit/metrics.test.ts`, `tests/unit/reports.test.ts`, `tests/unit/custom-goals.test.ts`, `tests/unit/goal-import-state.test.ts`, `tests/unit/goal-pdf.test.ts`, `tests/unit/goal-actions.test.ts`, `tests/e2e/crm-modal.spec.ts`, `tests/e2e/crm-to-dashboard.spec.ts`, `tests/e2e/funnel-labels.spec.ts`, `tests/e2e/goals-cycle.spec.ts`, `tests/e2e/mobile-responsiveness.spec.ts`.

- [ ] **Step 1: Rodar a suíte unitária inteira** — `npm test`; esperado: todos os testes passam no banco isolado `atelier_test` com a migração aplicada.
- [ ] **Step 2: Rodar typecheck e lint** — `npm run typecheck` e `npm run lint`; esperado: ambos finalizam sem erros.
- [ ] **Step 3: Rodar E2E das jornadas afetadas** — `npx playwright test tests/e2e/crm-modal.spec.ts tests/e2e/crm-to-dashboard.spec.ts tests/e2e/funnel-labels.spec.ts tests/e2e/goals-cycle.spec.ts tests/e2e/mobile-responsiveness.spec.ts`; esperado: etapas, fechamento da venda, painel, relatórios e metas passam em desktop e mobile.
- [ ] **Step 4: Rodar build de produção** — `npm run build`; esperado: Next.js compila com a migração/modelos atualizados. Não publicar nesta tarefa.
- [ ] **Step 5: Revisar diff e publicar commits** — verificar `git diff --check`, confirmar que arquivos temporários/artefatos `.next*` não foram staged e enviar todos os commits da feature à branch remota; não fazer deploy.
