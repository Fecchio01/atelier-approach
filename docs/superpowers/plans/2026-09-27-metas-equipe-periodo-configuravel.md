# Metas da equipe por período configurável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a empresa defina uma meta semanal e uma mensal por ciclo configurável, comparando os alvos com os resultados reais nos relatórios e no painel.

**Architecture:** Adicionar um cálculo compartilhado para intervalos locais de semana e ciclo mensal; persistir tipo e limites exatos em cada meta e o dia de início mensal nas configurações da equipe. Usar os dados agregados atuais como fonte dos resultados, ampliando os agregados para MRR, follow-ups concluídos e conversão. Atualizar as páginas de Metas, Relatórios e Painel para usar os mesmos limites.

**Tech Stack:** Next.js App Router, React Server Components/Actions, Prisma, PostgreSQL, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-27-metas-equipe-periodo-configuravel-design.md`

## Global Constraints

- Uma meta semanal da equipe usa segunda-feira a domingo.
- O ciclo mensal usa o dia escolhido pela empresa, de 1 a 31; dias inexistentes são ajustados ao último dia do mês.
- Os intervalos são inclusivos no início e exclusivos no próximo limite.
- As datas de calendário são calculadas no fuso `America/Sao_Paulo`.
- Metas pessoais deixam de aparecer e não são apagadas.
- Metas semanais existentes da equipe são preservadas na migração.
- Metas e relatórios usam os mesmos períodos e resultados existentes do CRM.
- Alterar o dia mensal mantém o início do ciclo ativo e define seu fim para a próxima ocorrência futura do novo dia; o alvo acompanha esse ciclo de transição e ciclos fechados permanecem intactos.
- Não criar alvos por pessoa, canal, categoria ou etapa do funil.

## Review Focus

- Início no dia 31 em fevereiro comum e bissexto, sem deslocar permanentemente o próximo ciclo.
- Troca do dia de início durante ciclo ativo, preservando ciclos fechados e movendo apenas o alvo ativo.
- Limites de segunda-feira e meia-noite no fuso de São Paulo, inclusive virada do mês/ano.
- Campo de meta vazio e período sem abordagens, exibindo realizado sem progresso indefinido ou divisão por zero.
- Migração com metas pessoais e metas semanais de equipe existentes, mantendo os alvos corretos e o histórico pessoal armazenado.

---

### Task 1: Períodos reutilizáveis e modelo persistente

**Files:**
- Create: `lib/goal-periods.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260927000000_team_goals_by_period/migration.sql`
- Modify only if required after provider preflight: `prisma/migrations/migration_lock.toml`

**Interfaces:**
- Produces `GoalPeriodKind = 'WEEKLY' | 'MONTHLY'`.
- Produces `GoalPeriodWindow = { kind: GoalPeriodKind; start: Date; end: Date }`.
- Exports `getGoalPeriodWindow(kind, reference, monthlyStartDay, activeStart?): GoalPeriodWindow`; `activeStart` preserves the current-cycle start and ends the transition cycle on the next configured date strictly after `reference`.
- Adds Prisma `GoalPeriodKind` enum, `Goal.periodKind`, `Goal.periodStart`, `Goal.periodEnd`, eight nullable target columns, and unique key `[ownerId, periodKind, periodStart]`.
- Adds `TeamGoalSettings` singleton with `monthlyStartDay` defaulting to 1.

- [ ] **Step 1: Confirm migration provider and existing deployment history**

Run `npx prisma migrate status` against the configured database without printing its URL or credentials. The schema datasource is PostgreSQL while `migration_lock.toml` labels the history as legacy SQLite. Record the applied migration state, then create an additive migration for the confirmed provider. If Prisma's provider check requires updating the lock file, do so only after confirming the existing database history; never rewrite historical migration SQL.

- [ ] **Step 2: Define the Prisma schema for period-based team goals**

Replace `weekStart` with `periodKind`, `periodStart`, and `periodEnd`; make `approachesTarget`, `interestsTarget`, `meetingsTarget`, `salesTarget`, and `revenueTarget` nullable; add nullable `mrrTarget`, `followUpsCompletedTarget`, and `conversionRateTarget`; retain `ownerId` to preserve old personal rows; change uniqueness to `[ownerId, periodKind, periodStart]`; add `TeamGoalSettings` with `monthlyStartDay` defaulting to 1.

- [ ] **Step 3: Add the migration preserving current rows**

Map every existing `weekStart` row to `periodKind = WEEKLY`, `periodStart = weekStart`, and `periodEnd = weekStart + 7 days`; preserve `ownerId` and positive configured target values. Convert old zero targets to null (unset), leave new targets null, and keep personal goal rows in the table. Seed the team monthly start day to 1.

- [ ] **Step 4: Implement São Paulo calendar boundaries**

In `lib/goal-periods.ts`, implement week and anchored-month bounds as half-open intervals. Calculate each month boundary independently with `min(monthlyStartDay, daysInMonth)` so day 31 returns to day 31 after February. On an anchor change, retain the current saved period start and end that transition period at the next new anchor date strictly after today; subsequent periods use the selected day. Use persisted `periodStart`/`periodEnd` for all closed goals.

- [ ] **Step 5: Review the migration and period behavior**

Inspect the generated migration and the helper behavior against the five Review Focus cases before moving to UI integration. Do not modify existing migration history.

- [ ] **Step 6: Commit the data model and period helper**

Commit as `feat: add configurable team goal periods`.

### Task 2: Save and edit weekly/monthly team targets

**Files:**
- Modify: `lib/metrics.ts`
- Modify: `app/(app)/metas/page.tsx`

**Interfaces:**
- Consumes: `GoalPeriodWindow` and Prisma schema from Task 1.
- Produces `GoalMetricKey = 'approaches' | 'interests' | 'meetings' | 'sales' | 'revenue' | 'mrr' | 'followUpsCompleted' | 'conversionRate'`.
- Produces `TeamGoalTargets = Record<GoalMetricKey, number | null>` and `upsertTeamGoal(period: GoalPeriodWindow, targets: TeamGoalTargets)`.
- Produces `GoalMetricProgress = { actual: number; target: number | null; ratio: number | null }` and `GoalProgressByMetric = Record<GoalMetricKey, GoalMetricProgress>`; `ratio` is `null` when no target is configured.
- Produces `saveMonthlyStartDay(day: number)` for the team settings singleton.

- [ ] **Step 1: Replace weekly-only persistence with period-based team persistence**

Implement `upsertTeamGoal(period: GoalPeriodWindow, targets: TeamGoalTargets)` in `lib/metrics.ts`, always using owner id `__team__`, exact start/end bounds, period kind, and all eight optional targets. Keep old personal goal records readable but do not expose them through new goal calculations.

- [ ] **Step 2: Add server validation and settings persistence**

In the Metas server actions, validate day 1–31, positive integer count targets, positive monetary targets, and conversion 1–100. Treat blank values as `null`. Save the day and active monthly goal bounds in one Prisma transaction so changing the day changes only the active transition window and target.

- [ ] **Step 3: Replace the personal form with team period controls**

Render weekly and monthly team forms, show the monthly start day and exact active dates, group the eight targets under production and revenue, and explain when a changed day is reflected. Remove the personal-goal form without deleting database rows.

- [ ] **Step 4: Commit the Metas workflow**

Commit as `feat: configure weekly and monthly team targets`.

### Task 3: Align report periods and goal comparisons

**Files:**
- Modify: `lib/reports.ts`
- Modify: `app/(app)/relatorios/page.tsx`
- Modify: `app/api/reports/route.ts` only if its default period resolution bypasses the shared helper.

**Interfaces:**
- Consumes: `GoalPeriodWindow`, `GoalMetricKey`, and `TeamGoalTargets`.
- `buildReport({ from, to, now })` retains its explicit-range contract.
- `getRecentReportRange('week' | 'month', reference, monthlyStartDay)` returns the shared current period bounds.

- [ ] **Step 1: Replace rolling 7/30-day defaults with calendar goal windows**

Keep explicit `from`/`to` report API requests working. Make the page’s week and month selectors resolve to the current Monday–Sunday week and the current configured monthly cycle.

- [ ] **Step 2: Expose actual values for every goal metric**

Use existing report counts for approaches, interests, meetings, wins, revenue, MRR, and conversion; count completed follow-ups by `completedAt` in the interval. Return the selected range with the report as today.

- [ ] **Step 3: Render actual versus target in Relatórios**

Load the team goal for the selected period, show target, actual, and progress for each configured target, show actual without progress when no target exists, and display “—” for conversion when there are no approaches. Keep channel, funnel, member, and follow-up analyses.

- [ ] **Step 4: Add navigation for saved prior periods**

Navigate previous periods only when a saved goal record provides its exact `periodStart` and `periodEnd`, so an anchor change does not rewrite completed periods. A saved period may have some or all targets unset; show its actual results without progress for those metrics. Keep the current week and cycle as the default selections.

- [ ] **Step 5: Commit the report comparison**

Commit as `feat: compare report results with team goals`.

### Task 4: Show both team goal periods on the dashboard

**Files:**
- Modify: `lib/metrics.ts`
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `GoalPeriodWindow` and `TeamGoalTargets`.
- `getDashboardMetrics` continues returning personal activity results but returns separate weekly and monthly team actuals/progress; it no longer returns personal goal progress.

- [ ] **Step 1: Aggregate period actuals for all goal metrics**

Extend dashboard aggregation to include MRR, completed follow-ups by completion date, and conversion numerator/denominator for a supplied range. Return null progress for metrics without targets.

- [ ] **Step 2: Load team settings and current goals**

In the dashboard page, calculate current week and month through `lib/goal-periods.ts`; load the current team goals and completed follow-ups covering those intervals; leave personal activity results intact.

- [ ] **Step 3: Render separate weekly and monthly progress summaries**

Show both team goal periods with their dates and the same target/actual progress used by Relatórios. Remove personal goal progress while retaining the user’s actual personal performance section.

- [ ] **Step 4: Commit the dashboard update**

Commit as `feat: show weekly and monthly team goal progress`.

### Task 5: Final integration review

**Files:**
- Review: `lib/goal-periods.ts`, `lib/metrics.ts`, `lib/reports.ts`
- Review: `app/(app)/metas/page.tsx`, `app/(app)/relatorios/page.tsx`, `app/(app)/page.tsx`
- Review: `prisma/schema.prisma` and the new migration

- [ ] **Step 1: Walk through the approved user scenarios locally**

Confirm the Metas page saves one weekly and one monthly team goal; day 14 shows the 14th through the 13th; day 31 handles February and resumes at 31; changing the day moves the current target only; reports and dashboard show identical ranges and progress; personal goal rows remain stored but hidden.

- [ ] **Step 2: Review data migration compatibility**

Confirm old weekly team goal targets and dates are preserved, new target fields are empty until configured, and personal goal rows have not been deleted.

- [ ] **Step 3: Commit the integration adjustments**

Commit any final integration fixes as `fix: align team goal periods across the app`.
