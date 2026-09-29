# Atelier Approach Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every authenticated Atelier Approach page comfortable to use on phones while preserving the existing desktop experience and visual identity.

**Architecture:** Keep the current desktop sidebar. Extract the mobile header and accessible route drawer into a focused client component, then improve page-specific responsive layouts in existing components. Keep wide kanban and report data inside intentional nested scrollers, and prove there is no page-level horizontal overflow at narrow widths.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4, Phosphor Icons, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-mobile-responsiveness-design.md`

## Global Constraints

- Preserve the established Atelier mark, icon language, dark surfaces, lime accent, labels, and business behavior.
- Do not add emoji, new color systems, dependencies, data flows, or mobile-only product capabilities.
- Desktop behavior at and above `md` should remain materially unchanged.
- At 320, 375/390, and 430 CSS-pixel viewport widths, `document.documentElement.scrollWidth <= window.innerWidth`, except for intentional nested scrollers.
- Use the existing `@phosphor-icons/react` icons and provide at least 44px touch targets for mobile navigation.
- Keep all seven CRM stages in the kanban; allow horizontal touch scrolling only inside the board.

## Review Focus

- **Narrowest 320px viewport:** Search labels, account controls, long names, and form buttons must not force document overflow. Pin this to the route-matrix viewport assertion in Task 2 and Task 4.
- **Drawer keyboard/backdrop lifecycle:** Escape, backdrop, route selection, focus restoration, and background-scroll lock must agree. Pin these to the mobile drawer Playwright test in Task 1.
- **Nested horizontal overflow:** The kanban/report table can scroll without expanding the document. Pin these to the board/table assertions in Tasks 3 and 4.
- **Short phone height with an open lead dialog:** Header, tabs, fields, and primary actions must remain reachable by internal scrolling. Pin this to the lead-dialog Playwright test in Task 3.
- **Desktop regressions:** Existing sidebar navigation and multi-column layouts remain intact at desktop widths. Pin this to the desktop navigation regression in Task 5.

---

### Task 1: Accessible mobile route drawer

**Files:**
- Create: `components/mobile-navigation.tsx`
- Modify: `components/app-shell.tsx`
- Test: `tests/unit/app-shell.test.tsx`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- `MobileNavigation` consumes `{ pathname: string; user: { name: string; email: string }; onSignOut: () => Promise<void>; onNavigate: () => void }`.
- It renders the mobile sticky header and drawer for Painel, Funil, Empresas, Metas, Relatórios, Meu perfil, and Sair da conta. The existing desktop sidebar remains in `AppShell`.

- [ ] **Step 1: Add the failing shell structure test**

Add `test('renders a compact mobile header and keeps the desktop navigation separate', ...)` to `tests/unit/app-shell.test.tsx`. Assert a labeled mobile menu control and the five primary destinations are rendered in the mobile navigation structure; assert the desktop sidebar still contains its existing five route links and profile/sign-out actions.

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/unit/app-shell.test.tsx`
Expected: FAIL because the current mobile header has no menu control or drawer.

- [ ] **Step 3: Implement `MobileNavigation` and integrate it into `AppShell`**

Create `components/mobile-navigation.tsx` as a focused client component using the installed Phosphor icons and a native modal `<dialog>` for the side drawer. Ensure route selection and backdrop close the drawer, native Escape closes it, focus returns to the trigger, background interaction is blocked, route selection preserves the current search-scroll event, and each control has a 44px minimum hit area. Keep the desktop aside unchanged.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/app-shell.test.tsx`
Expected: PASS; five route links remain in the desktop navigation and five in the mobile drawer.

- [ ] **Step 5: Add and run the failing mobile drawer Playwright test**

Add `test('opens and closes the mobile navigation drawer accessibly', ...)` to `tests/e2e/mobile-responsiveness.spec.ts`. At 375×812, sign in, open the drawer, verify all five route links and profile/sign-out actions, verify Escape and backdrop dismissal, and verify choosing Metas navigates and closes the drawer.

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "opens and closes"`
Expected before implementation completion: FAIL on the missing drawer behavior; after Step 3, PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add components/mobile-navigation.tsx components/app-shell.tsx tests/unit/app-shell.test.tsx tests/e2e/mobile-responsiveness.spec.ts
git commit -m "feat: add accessible mobile navigation drawer"
```

### Task 2: Dashboard, search, and profile layouts

**Files:**
- Modify: `app/(app)/page.tsx`
- Modify: `app/(app)/pesquisa/page.tsx`
- Modify: `components/search-form.tsx`
- Modify: `components/lead-card.tsx`
- Modify: `app/(app)/configuracoes/page.tsx`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Keep existing page routes, query parameters, server actions, search state, and card actions unchanged.
- Reuse the route/viewport helpers introduced in Task 1's mobile Playwright spec.

- [ ] **Step 1: Add failing viewport assertions for dashboard, search, and profile**

Add `test('keeps dashboard, search, and profile usable without page overflow on phones', ...)`. For widths 320, 375, and 430, navigate through `/`, `/pesquisa`, and `/configuracoes`; assert the page scroll width does not exceed the viewport, primary headings/actions are visible, and each search label/input remains visible and enabled. Stub the search endpoint in the test with one prospect whose name and contact buttons exercise card wrapping.

- [ ] **Step 2: Run the targeted test and confirm current layout failures**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "dashboard, search, and profile"`
Expected: FAIL on one or more missing narrow-screen layout assertions before the responsive changes.

- [ ] **Step 3: Make dashboard, search, and profile layouts mobile-first**

In the listed page/component files, reduce gutters to approximately 16px below tablet widths, collapse grids to one column on phones, allow long copy/contact actions to wrap, make field and submit controls fill the narrow container where needed, and prevent table/card children from imposing intrinsic page width. Preserve current desktop breakpoint composition and search/CRM behavior.

- [ ] **Step 4: Run the targeted test and confirm the layouts pass**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "dashboard, search, and profile"`
Expected: PASS at widths 320, 375, and 430 with no document overflow.

- [ ] **Step 5: Commit Task 2**

```bash
git add "app/(app)/page.tsx" "app/(app)/pesquisa/page.tsx" components/search-form.tsx components/lead-card.tsx "app/(app)/configuracoes/page.tsx" tests/e2e/mobile-responsiveness.spec.ts
git commit -m "style: improve dashboard search and profile on mobile"
```

### Task 3: CRM board and lead detail on mobile

**Files:**
- Modify: `components/kanban-board.tsx`
- Modify: `components/lead-detail-modal.tsx`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Preserve all seven main funnel stages, existing stage mutations, lead-card semantics, and modal actions.
- The board remains a nested horizontal scroller; modal actions remain available through the current lead detail API.

- [ ] **Step 1: Add failing narrow-board and lead-dialog tests**

Add `test('contains kanban scrolling and keeps lead actions reachable on mobile', ...)`. At 375×667, create a temporary lead using the same API/cleanup pattern as `tests/e2e/crm-modal.spec.ts`, open `/crm`, assert the document has no horizontal overflow while the kanban region itself overflows horizontally, and open the lead detail dialog. Verify the dialog fits the viewport width, can scroll vertically, exposes its tabs, and keeps the close/primary actions reachable; remove the lead in `finally`.

- [ ] **Step 2: Run the targeted test to verify it exposes layout gaps**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "contains kanban scrolling"`
Expected: FAIL on currently unverified board/dialog viewport assertions.

- [ ] **Step 3: Adjust the board and modal for touch viewport use**

Keep horizontal scrolling contained to the board region, apply touch-friendly scrolling and a discoverable continuation affordance, and ensure a column/card remains practical to inspect. Adapt the dialog to nearly fill a phone viewport with internal vertical scrolling, usable/wrapping tabs and controls, and safe-area-aware padding without changing its desktop max-width behavior.

- [ ] **Step 4: Run the CRM mobile test and existing modal regression**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "contains kanban scrolling"`
Run: `npm run test:e2e -- tests/e2e/crm-modal.spec.ts`
Expected: both PASS; board overflow is nested, and existing close, escape, stage, and return actions remain functional.

- [ ] **Step 5: Commit Task 3**

```bash
git add components/kanban-board.tsx components/lead-detail-modal.tsx tests/e2e/mobile-responsiveness.spec.ts
git commit -m "style: adapt crm funnel and lead dialog to mobile"
```

### Task 4: Goals and reports layouts

**Files:**
- Modify: `app/(app)/metas/page.tsx`
- Modify: `app/(app)/metas/goal-center.tsx`
- Modify: `app/(app)/metas/goal-form.tsx`
- Modify: `app/(app)/relatorios/page.tsx`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Keep weekly/monthly goal editing, period selection, report query parameters, report metrics, and saved-cycle navigation unchanged.
- Keep wide report tables inside their own labeled overflow containers.

- [ ] **Step 1: Add failing goals/reports mobile assertions**

Add `test('keeps goals and reports usable without page overflow on phones', ...)`. At 320, 375, and 430 widths, check `/metas` weekly/monthly tabs, metric edit inputs/buttons, and save action; check `/relatorios` period navigation and metric cards. Assert page scroll width never exceeds the viewport and any table overflow is contained by its own scroll region.

- [ ] **Step 2: Run the targeted test to verify current constraints**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "goals and reports"`
Expected: FAIL on any missing phone viewport or contained-table assertions.

- [ ] **Step 3: Make goal and report surfaces fit phones**

Use one-column composition below tablet widths; allow the weekly/monthly switcher and cycle controls to wrap; reduce mobile panel gutters; ensure target-number editors remain wide enough for currency values and edit buttons; keep report metrics readable and make table scrolling local to each panel. Preserve existing goal save and report navigation behavior.

- [ ] **Step 4: Run responsive and existing feature regressions**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "goals and reports"`
Run: `npm run test:e2e -- tests/e2e/goals-cycle.spec.ts`
Expected: PASS; goals still save and report period navigation still works at desktop and mobile sizes.

- [ ] **Step 5: Commit Task 4**

```bash
git add "app/(app)/metas/page.tsx" "app/(app)/metas/goal-center.tsx" "app/(app)/metas/goal-form.tsx" "app/(app)/relatorios/page.tsx" tests/e2e/mobile-responsiveness.spec.ts
git commit -m "style: make goals and reports responsive on mobile"
```

### Task 5: Cross-route responsive and desktop verification

**Files:**
- Modify: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Exercise the public routes through the same authenticated browser context and existing E2E credentials; do not add test-only production behavior.

- [ ] **Step 1: Add the desktop regression assertion**

Add `test('preserves the desktop sidebar and multi-column dashboard layout', ...)`. At 1440×1000, assert the desktop sidebar navigation is visible, the mobile menu trigger is hidden, and the dashboard has no document overflow.

- [ ] **Step 2: Run all mobile responsive tests**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts`
Expected: PASS for drawer, all page groups at 320/375/430, CRM nested scrolling/detail dialog, and desktop regression.

- [ ] **Step 3: Run project-wide quality checks**

Run: `npm test`
Expected: all Vitest suites pass (existing explicitly skipped tests remain skipped).

Run: `npm run lint`
Expected: ESLint exits 0.

Run: `npm run typecheck`
Expected: TypeScript exits 0.

Run: `npm run build`
Expected: Next.js production build exits 0.

- [ ] **Step 4: Inspect the diff and commit any final test-only adjustments**

Run: `git diff --check` and `git status --short`.
Expected: no whitespace errors or unrelated files; every implementation task is already committed.

If Task 5 modified E2E files, commit those test-only changes:

```bash
git add tests/e2e/mobile-responsiveness.spec.ts
git commit -m "test: verify mobile and desktop responsive experience"
```
