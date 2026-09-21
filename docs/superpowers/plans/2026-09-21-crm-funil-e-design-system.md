# CRM Funnel and Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a calm, consistent Atelier Approach interface with a seven-stage CRM funnel, compact board cards, modal lead details, and the same visual hierarchy across all operational pages.

**Architecture:** Centralize funnel labels/order and visual primitives, then migrate the Prisma stage enum and API consumers. Replace the monolithic board card with a compact board-card plus an accessible lead-detail modal. Apply shared page header, surface, form and metric styles to existing routes without changing their business behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/SQLite, Tailwind CSS v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-crm-funil-modal-design.md`

## Global Constraints

- Preserve the current dark palette and use `--atelier-green` only for primary action, selected state and positive state.
- Preserve all existing routes, authentication, search behavior and CRM validations.
- The normal board never renders OSM IDs, full contact records or activity history.
- Lead deletion remains available only through the explicit confirmed “Devolver para pesquisa” action.
- Keep every actionable control keyboard accessible and use visible focus states.

## Review Focus

- Existing leads in every legacy `LeadStage` still render in a valid column after the enum migration.
- Closing a lead still requires both sale value and MRR after modalization.
- Escape, backdrop click and close button each close the details modal without submitting a CRM mutation.
- Narrow screens retain readable card widths through horizontal board scrolling rather than overlapping columns.
- Research results with missing contacts still have an actionable, readable compact card and can be marked approached.

---

## File Structure

- `prisma/schema.prisma`: expanded `LeadStage` values.
- `lib/funnel.ts`: canonical stage order, labels, main/auxiliary membership and metric mapping.
- `components/ui.tsx`: shared page header, surface and compact status primitives.
- `components/lead-detail-modal.tsx`: modal-only CRM detail/actions.
- `components/kanban-board.tsx`: compact board and modal state orchestration.
- `components/lead-card.tsx`: compact research card with progressive details.
- `app/globals.css`, `components/app-shell.tsx`: global surfaces, responsive navigation and route indication.
- `app/(app)/*/page.tsx`, `components/search-form.tsx`, `components/metric-card.tsx`: page-specific application of the shared system.

### Task 1: Canonical funnel model and persistence migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/funnel.ts`
- Modify: `components/kanban-board.tsx`, `app/(app)/page.tsx`, `lib/metrics.ts`, `lib/reports.ts`
- Test: `tests/unit/funnel.test.ts`, `tests/unit/metrics.test.ts`

**Interfaces:**
- Produces `mainFunnelStages`, `auxiliaryFunnelStages`, `stageLabels`, `isApproachStage(stage)` from `lib/funnel.ts`.
- Consumers no longer define local stage labels/order.

- [ ] **Step 1: Write failing funnel tests**

```ts
import { auxiliaryFunnelStages, mainFunnelStages, stageLabels } from '../../lib/funnel';

test('orders the seven operational funnel stages', () => {
  expect(mainFunnelStages).toEqual(['NEW', 'CONTACTED', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'WON']);
  expect(auxiliaryFunnelStages).toEqual(['NO_RESPONSE', 'DISCARDED']);
  expect(stageLabels.PROPOSAL).toBe('Proposta enviada');
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- --run tests/unit/funnel.test.ts`

Expected: FAIL because `lib/funnel.ts` does not exist.

- [ ] **Step 3: Add enum values and the canonical module**

```prisma
enum LeadStage {
  NEW CONTACTED IN_CONVERSATION QUALIFIED PROPOSAL FOLLOW_UP WON NO_RESPONSE DISCARDED
}
```

```ts
export const mainFunnelStages = ['NEW', 'CONTACTED', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'WON'] as const;
export const auxiliaryFunnelStages = ['NO_RESPONSE', 'DISCARDED'] as const;
export const stageLabels = { NEW: 'Novo', CONTACTED: 'Abordado', IN_CONVERSATION: 'Em conversa', QUALIFIED: 'Qualificado', PROPOSAL: 'Proposta enviada', FOLLOW_UP: 'Follow-up', WON: 'Ganho', NO_RESPONSE: 'Sem resposta', DISCARDED: 'Descartado' } as const;
```

Run the Prisma migration command appropriate to the local SQLite database, regenerate Prisma client, and replace local stage arrays/maps with imports from `lib/funnel.ts`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- --run tests/unit/funnel.test.ts tests/unit/metrics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/funnel.ts components/kanban-board.tsx app/(app)/page.tsx lib/metrics.ts lib/reports.ts tests/unit/funnel.test.ts tests/unit/metrics.test.ts
git commit -m "feat: expand CRM funnel stages"
```

### Task 2: Compact board cards and accessible modal detail

**Files:**
- Create: `components/lead-detail-modal.tsx`
- Modify: `components/kanban-board.tsx`
- Test: `tests/unit/kanban-board.test.ts`, `tests/e2e/acceptance.spec.ts`

**Interfaces:**
- `LeadDetailModal({ lead, onClose, onUpdated })` receives one `CrmLead`, owns the existing CRM action controls and sends updates via existing endpoints.
- `KanbanBoard` owns `selectedLeadId` and renders only `LeadBoardCard` summaries in columns.

- [ ] **Step 1: Write failing presentation tests**

```ts
test('keeps OSM IDs and contact history out of the board card until the modal opens', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/kanban-board.tsx'), 'utf8');
  expect(source).toContain('aria-label={`Abrir detalhes de ${lead.name');
  expect(source).not.toContain('<p className="break-all text-xs text-white/45">{lead.osmId}</p>');
});
```

Add an E2E test that clicks a card, verifies dialog role/title and verifies Escape closes it.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --run tests/unit/kanban-board.test.ts`

Expected: FAIL because the board still exposes card details inline.

- [ ] **Step 3: Split summary from detail**

Implement compact button cards: name, latest activity time and contact markers only. Implement a `role="dialog" aria-modal="true"` overlay with backdrop blur, focusable close button, Escape handler and click-outside close. Move existing stage, follow-up, activity, win, discard and restore controls to the modal without changing request payloads.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- --run tests/unit/kanban-board.test.ts tests/unit/lead-routes.test.ts && npm run test:e2e -- --grep "CRM"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/kanban-board.tsx components/lead-detail-modal.tsx tests/unit/kanban-board.test.ts tests/e2e/acceptance.spec.ts
git commit -m "feat: add compact CRM board and lead modal"
```

### Task 3: Board layout, responsive behavior and visual primitives

**Files:**
- Modify: `app/globals.css`, `components/app-shell.tsx`, `app/(app)/crm/page.tsx`
- Create: `components/ui.tsx`
- Test: `tests/e2e/acceptance.spec.ts`

**Interfaces:**
- `PageHeading({ eyebrow, title, description, action })` and `Surface({ children, className })` provide consistent page framing.

- [ ] **Step 1: Write failing responsive E2E test**

```ts
test('keeps CRM columns readable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/crm');
  await expect(page.getByRole('region', { name: 'Funil CRM' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test:e2e -- --grep "keeps CRM columns readable"`

Expected: FAIL because the board region and horizontal layout contract do not exist.

- [ ] **Step 3: Implement visual primitives and board geometry**

Set off-black layered surfaces, subtle borders, card hover/pressed states and active route style. Use a horizontally scrollable board region with fixed readable column width on small screens and seven columns on wide screens. Keep auxiliary stages in a separate subdued region.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `npm run test:e2e -- --grep "CRM"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/app-shell.tsx components/ui.tsx app/(app)/crm/page.tsx tests/e2e/acceptance.spec.ts
git commit -m "feat: polish CRM visual system"
```

### Task 4: Apply the system to research and prospect details

**Files:**
- Modify: `app/(app)/pesquisa/page.tsx`, `components/search-form.tsx`, `components/lead-card.tsx`
- Test: `tests/unit/search-form.test.ts`, `tests/unit/lead-card.test.ts`, `tests/e2e/acceptance.spec.ts`

**Interfaces:**
- Existing search request/response interfaces remain unchanged.
- `LeadCard` retains the mark-approached workflow and contact links while exposing secondary data through a details disclosure or modal.

- [ ] **Step 1: Write failing research-card test**

```ts
test('keeps a research prospect actionable when all direct contacts are missing', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/lead-card.tsx'), 'utf8');
  expect(source).toContain('Abrir no Google Maps');
  expect(source).toContain('Marcar como abordada');
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- --run tests/unit/lead-card.test.ts`

Expected: FAIL until the compact card render helper or DOM assertion matches the new disclosure structure.

- [ ] **Step 3: Implement research hierarchy**

Apply `PageHeading` and `Surface`; make filters visually quiet and primary search action clear. Limit each result card’s default view to name, priority/channel indicators and actions. Place address, category, coordinates and priority explanation in progressive details. Do not remove WhatsApp, Instagram, site, Google Maps or “Marcar como abordada”.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- --run tests/unit/search-form.test.ts tests/unit/lead-card.test.ts && npm run test:e2e -- --grep "search"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/pesquisa/page.tsx components/search-form.tsx components/lead-card.tsx tests/unit/search-form.test.ts tests/unit/lead-card.test.ts tests/e2e/acceptance.spec.ts
git commit -m "feat: align research with Atelier visual system"
```

### Task 5: Apply shared hierarchy to operational pages

**Files:**
- Modify: `app/(app)/page.tsx`, `app/(app)/metas/page.tsx`, `app/(app)/relatorios/page.tsx`, `app/(app)/configuracoes/page.tsx`, `components/metric-card.tsx`
- Test: `tests/e2e/acceptance.spec.ts`

**Interfaces:**
- Existing server actions, report APIs and metrics values stay unchanged.
- All pages consume `PageHeading` and `Surface` where appropriate.

- [ ] **Step 1: Write failing navigation and hierarchy E2E test**

```ts
test('shows a consistent page heading on every operational route', async ({ page }) => {
  for (const route of ['/', '/metas', '/relatorios', '/configuracoes']) {
    await page.goto(route);
    await expect(page.getByTestId('page-heading')).toBeVisible();
  }
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test:e2e -- --grep "consistent page heading"`

Expected: FAIL because pages do not share the testable heading primitive.

- [ ] **Step 3: Implement shared operational hierarchy**

Use coherent headings, metric surfaces, readable form groups and empty/error states. Preserve every field, report number and server action; this task changes presentation, spacing and navigation feedback only.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm run test:e2e -- --grep "operational|heading"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/page.tsx app/(app)/metas/page.tsx app/(app)/relatorios/page.tsx app/(app)/configuracoes/page.tsx components/metric-card.tsx components/ui.tsx tests/e2e/acceptance.spec.ts
git commit -m "feat: unify operational page design"
```

### Task 6: Full verification and visual QA

**Files:**
- Modify only if verification reveals a scoped defect.

- [ ] **Step 1: Run all automated verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build && npm run test:e2e`

Expected: all commands exit zero.

- [ ] **Step 2: Inspect local UI**

Run the application locally and inspect CRM desktop, CRM narrow viewport, research desktop and dashboard. Verify modal focus/close behavior, card density, readable column layout and action links.
