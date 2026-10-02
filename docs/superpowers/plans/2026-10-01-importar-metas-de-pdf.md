# Importação de metas em PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar sugestões de metas de PDFs textuais, permitir revisão/edição e salvar metas fixas e personalizadas no ciclo semanal ou mensal sem perder edição manual do progresso personalizado.

**Architecture:** A extração do PDF acontece no navegador usando PDF.js; um parser puro converte texto em rascunho editável e não envia o arquivo à rede. Metas personalizadas validadas no servidor ficam em uma coluna JSONB aditiva do registro `Goal`; Server Actions salvam metas legadas e personalizadas atomicamente no ciclo atual.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL (Supabase), PDF.js, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-importar-metas-de-pdf-design.md`

## Global Constraints

- O PDF permanece local no navegador; não enviar nem armazenar o documento.
- Aceitar PDF textual com limite de 10 MB, até 100 páginas e 200 mil caracteres extraídos; sem OCR ou IA externa.
- Não persistir sugestões sem revisão e confirmação explícita.
- Métricas atuais mantêm cálculo automático; só metas personalizadas têm progresso manual.
- Validação no servidor permite até 30 metas personalizadas; nome até 80 caracteres, unidade até 24 caracteres, alvo finito maior que zero, progresso finito não negativo, IDs únicos e ícones de uma lista permitida.
- Destino, equipe e ciclo são determinados no servidor a partir da ação e do ciclo selecionado, nunca confiados a valores de owner/ciclo enviados pelo cliente.
- Persistência do ciclo e atualização mensal existente devem ser atômicas e compatíveis com registros legados.

## Review Focus

- PDF inválido, sem texto ou acima do limite: apresentar erro compreensível sem perder o formulário manual.
- Linhas com múltiplos números/valores contraditórios: não adivinhar; deixar fora do rascunho ou sem alvo até revisão.
- Unidades e números brasileiros (ponto de milhar, vírgula decimal, moeda e porcentagem): preservar valor numérico correto.
- Payload malformado/adulterado (IDs repetidos, NaN/Infinity, alvo ou progresso negativo, ícone arbitrário, textos excessivos): rejeitar antes de persistir.
- Falha durante gravação: operação atômica e conteúdo revisado ainda editável para nova tentativa.

---

### Task 1: Contrato e persistência das metas personalizadas

**Files:**
- Create: `lib/custom-goals.ts`
- Test: `tests/unit/custom-goals.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261001000000_custom_goal_metrics/migration.sql`
- Modify: `lib/metrics.ts`
- Test: `tests/unit/goal-migrations.test.ts`

**Interfaces:**
- Produces `CustomGoalMetric`, `parseCustomGoalMetrics(unknown)`, and `customGoalIcons` for the client, parser, and server action.
- `upsertTeamGoal(period, targets, database, customGoals)` upserts the current period while preserving fixed target semantics.

- [x] Write tests for valid normalization, duplicate IDs, invalid numeric values, limits, and icon allowlist.
- [x] Run the focused tests and confirm they fail because the contract does not exist.
- [x] Add a JSONB field with `[]` default, create validators, and extend the upsert helper.
- [x] Run the focused tests and `npx prisma generate` against the updated schema.
- [x] Add migration compatibility coverage proving the default preserves existing rows.

### Task 2: Local PDF extraction and conservative parser

**Files:**
- Modify: `package.json`, lockfile
- Create: `lib/goal-pdf.ts`
- Create: `lib/read-goal-pdf.ts`
- Create: `scripts/copy-pdfjs-assets.mjs`
- Create: `tests/unit/goal-pdf.test.ts`

**Interfaces:**
- `parseGoalDocumentText(text: string): GoalPdfDraft` yields fixed-metric target suggestions and custom metrics.
- Browser extraction is isolated behind a client-only helper and the pinned PDF.js dependency.

- [x] Test recognized aliases, custom labels/units, Brazilian numeric formatting, explicit current/target pairs, and ambiguous/empty input.
- [x] Verify the tests fail for the unimplemented parser.
- [x] Add PDF.js and implement bounded local text extraction and a conservative parser.
- [x] Verify malformed/oversized PDF cases return actionable errors and do not invoke persistence.

### Task 3: Review UI and manual custom progress

**Files:**
- Create: `app/(app)/metas/goal-importer.tsx`
- Create: `app/(app)/metas/custom-goal-metrics.tsx`
- Modify: `app/(app)/metas/goal-form.tsx`
- Modify: `app/(app)/metas/page.tsx`
- Modify: `app/(app)/metas/goal-center.tsx`
- Create: `lib/goal-import-state.ts`
- Test: `tests/unit/goal-import-state.test.ts`
- Test: `tests/e2e/goal-pdf-import.spec.ts`

**Interfaces:**
- Importer returns only reviewed draft changes to the parent form; it never calls the database action directly.
- Goal form owns controlled fixed/custom drafts and serializes custom metrics in a hidden form field.

- [x] Test merge semantics for reviewed fixed/custom goals; end-to-end covers correction, removal control, manual custom goal editing, and weekly/monthly cycles.
- [x] Verify UI and action tests fail before implementation.
- [x] Implement PDF file selection, extraction/error states, review rows and apply-to-selected-cycle behavior.
- [x] Implement custom metric cards with allowed Phosphor icon mapping, editable target/progress, add/remove controls, and responsive layout.
- [x] Keep CRM-derived progress read-only and visibly distinct from manual custom progress.

### Task 4: Authenticated atomic saves

**Files:**
- Modify: `app/(app)/metas/actions.ts`
- Modify: `tests/unit/goal-actions.test.ts`

**Interfaces:**
- Weekly and monthly save actions parse custom draft data, enforce current server-side team/cycle, then persist the fixed targets and custom collection together.

- [x] Add failing tests for saving custom goals atomically on weekly/monthly cycles, auth rejection, and malformed payload rejection.
- [x] Implement server validation and transactional upserts; preserve monthly-start-day behavior.
- [x] Verify invalid values are rejected before persistence and errors remain inline for the client.

### Task 5: End-to-end verification

**Files:**
- Create: `tests/e2e/goal-pdf-import.spec.ts`
- Modify: `tests/e2e/goals-cycle.spec.ts` if shared cleanup/setup is needed.

- [x] Generate an in-memory text PDF fixture, import it on the weekly cycle, correct a suggestion, save, reload, and verify persistence.
- [x] Import on the monthly cycle and verify it stays separate from the weekly cycle.
- [x] Edit a custom goal's progress and verify fixed CRM metrics remain read-only and retain their calculated actuals.
- [x] Run focused and full unit tests, typecheck, lint for touched source, relevant E2E tests, and production build.
- [ ] Commit and push the implementation on the current feature branch; do not deploy until separately requested.
