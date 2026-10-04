# Apple-inspired System-Wide Interaction Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Apple Design principles across all Atelier Approach screens while preserving the current brand, information architecture, and every working product flow.

**Architecture:** Establish a small global motion/type/accessibility foundation, then apply it to the shared shell and existing high-use controls on each route. Keep changes presentational and interaction-focused; do not alter APIs, database state, calculations, permissions, or business logic.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4, global CSS, Phosphor Icons, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-apple-design-system-design.md`

## Global Constraints

- Preserve the Atelier dark/green brand, names, page compositions, and familiar interactions.
- Preserve all business logic, data, permissions, endpoints, calculations, persistence, and scrolling behavior.
- Use short, coherent transitions; animate only `transform` and `opacity`; never block input during a transition.
- Use transparency/blur only for floating chrome and dialog layers; keep content and forms legible on solid surfaces.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more`.
- Keep mobile layouts usable without horizontal page overflow.
- Do not add new animation dependencies, gestures, scroll hijacking, sound, haptics, or gratuitous continuous motion.

## Review Focus

- Persistence and async feedback: manual/PDF goals remain saved, replaceable, and removable; login, search, CRM updates, period navigation, and day-close keep their pending/error/retry states. Pin with Task 1 and Task 5 goal tests plus the existing flow tests in Tasks 4–6.
- Reduced-motion preference: all shared transitions become still or near-still without removing state feedback. Pin in Task 2's reduced-motion Playwright test.
- Reduced-transparency and high-contrast preferences: floating surfaces become opaque and controls retain clear boundaries. Pin in Task 2's contrast test and inspect the reduced-transparency rule during CSS review.
- Interrupted/reversed menu and dialog interaction: controls remain usable, Escape/outside dismissal works, focus returns to the trigger. Pin in Task 3's mobile navigation E2E and Task 4's CRM dialog E2E.
- Narrow viewport and long dynamic text: at 320, 375, and 430 px, pages remain reachable without horizontal document overflow. Pin with existing mobile E2E scenarios in Tasks 4–6.

---

### Task 1: Preserve and checkpoint approved goal changes already in progress

**Files:**
- Modify: `app/(app)/metas/actions.ts`
- Modify: `app/(app)/metas/custom-goal-metrics.tsx`
- Modify: `app/(app)/metas/goal-form.tsx`
- Modify: `app/(app)/metas/goal-importer.tsx`
- Modify: `lib/custom-goals.ts`
- Modify: `lib/goal-import-state.ts`
- Test: `tests/unit/goal-actions.test.ts`
- Test: `tests/unit/goal-import-state.test.ts`
- Test: `tests/unit/custom-goals.test.ts`
- Test: `tests/unit/goal-pdf.test.ts`
- Test: `tests/e2e/goals-cycle.spec.ts`
- Test: `tests/e2e/goal-pdf-import.spec.ts`

**Interfaces:**
- Consumes: the already-approved user request for persistent, removable manual indicators and replaceable PDF-imported indicators.
- Produces: a clean, separately committed baseline so later visual-only changes cannot accidentally mix with goal persistence logic.

- [ ] **Step 1: Verify the approved goal behavior before styling work**

Run: `npm test -- tests/unit/goal-actions.test.ts tests/unit/goal-import-state.test.ts tests/unit/custom-goals.test.ts tests/unit/goal-pdf.test.ts`
Expected: all focused unit tests pass; manual goals save to the selected cycle and PDF-imported goals remain removable or replaceable without disturbing defaults.

- [ ] **Step 2: Commit only the existing goal implementation and its tests**

Stage only the ten listed goal source/unit-test files plus `tests/e2e/goals-cycle.spec.ts` and `tests/e2e/goal-pdf-import.spec.ts`. Do not stage `.next-task2-sales/`, `.next-verification-pdf/`, or other generated output.

```bash
git add "app/(app)/metas/actions.ts" "app/(app)/metas/custom-goal-metrics.tsx" "app/(app)/metas/goal-form.tsx" "app/(app)/metas/goal-importer.tsx" lib/custom-goals.ts lib/goal-import-state.ts tests/unit/goal-actions.test.ts tests/unit/goal-import-state.test.ts tests/unit/custom-goals.test.ts tests/unit/goal-pdf.test.ts tests/e2e/goals-cycle.spec.ts tests/e2e/goal-pdf-import.spec.ts
git commit -m "fix: persist and manage team goal indicators"
```

### Task 2: Global type, motion, and accessibility preferences

**Files:**
- Modify: `app/globals.css`
- Create: `tests/e2e/apple-design-system.spec.ts`

**Interfaces:**
- Produces: global CSS tokens `--atelier-motion-duration` (`180ms` by default) and `--atelier-motion-easing` (`cubic-bezier(0.2, 0.8, 0.2, 1)`); platform-native sans-serif typography; preference-aware `--atelier-floating-border` and surface styles used by later tasks.

- [ ] **Step 1: Write the failing browser tests**

Add `test('uses the platform font and honors reduced motion')`: open `/login`, assert the computed body font stack includes `system-ui`, emulate `reducedMotion: 'reduce'`, and assert the computed `--atelier-motion-duration` is `0ms`.

Add `test('raises contrast when the user requests more contrast')`: open `/login`, read `--atelier-floating-border`, emulate `contrast: 'more'`, and assert the token becomes `rgba(255, 255, 255, 0.38)` rather than the default `rgba(255, 255, 255, 0.12)`.

Also assert the stylesheet includes the `prefers-reduced-transparency: reduce` fallback so translucent navigation/dialog layers have an automated rule-presence check even though Playwright cannot emulate this preference directly.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:e2e -- tests/e2e/apple-design-system.spec.ts`
Expected: both tests fail because the agreed tokens/preferences have not been defined.

- [ ] **Step 3: Implement the global foundation**

Define the tokens and system-font stack in `app/globals.css`; scope press/focus feedback consistently; set duration to `0ms` for reduced motion; add solid-surface fallback for reduced transparency and the specified high-contrast token. Keep preference fallbacks progressive so unsupported media features retain the readable base surface. Leave the root document language and structure untouched.

- [ ] **Step 4: Re-run the tests**

Run: `npm run test:e2e -- tests/e2e/apple-design-system.spec.ts`
Expected: both tests pass in Chromium, including the reduced-motion and high-contrast emulation paths.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tests/e2e/apple-design-system.spec.ts
git commit -m "feat: add accessible Atelier interaction foundations"
```

### Task 3: Shared shell, mobile navigation, and UI primitives

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `components/mobile-navigation.tsx`
- Modify: `components/ui.tsx`
- Test: `tests/unit/app-shell.test.tsx`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Consumes: Task 2 global motion/type/accessibility tokens.
- Produces: consistent floating chrome and interruptible open/close feedback while preserving existing accessible navigation APIs.

- [ ] **Step 1: Extend navigation regression coverage**

Extend `test('opens and closes the mobile navigation drawer accessibly')` with a panel transition assertion (`transition-property` includes `transform` and `opacity`). Add `test('mobile navigation remains operable with reduced motion')`: emulate reduced motion, open the drawer, assert computed duration is `0s`, dismiss with Escape, and assert focus returns to the opener.

- [ ] **Step 2: Run the test to verify the new reduced-motion assertion fails**

Run: `npm run test:e2e -- tests/e2e/mobile-responsiveness.spec.ts -g "opens and closes the mobile navigation drawer accessibly"`
Expected: the focus/keyboard regression remains green and the new computed transition assertion fails until the shared shell uses Task 2's tokens.

- [ ] **Step 3: Apply the shared shell treatment**

Update desktop sidebar and mobile header/drawer surfaces with the approved restrained material hierarchy. Add reversible, non-blocking motion to the native mobile dialog and shared interactive states. Keep route links, current-page state, focus return, Escape handling, and sign-out unchanged.

- [ ] **Step 4: Verify unit and browser regressions**

Run: `npm test -- tests/unit/app-shell.test.tsx`
Run: `npm run test:e2e -- tests/e2e/menu-navigation.spec.ts tests/e2e/mobile-responsiveness.spec.ts`
Expected: all navigation, focus, route, and viewport assertions pass.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell.tsx components/mobile-navigation.tsx components/ui.tsx tests/unit/app-shell.test.tsx tests/e2e/mobile-responsiveness.spec.ts
git commit -m "feat: refine shared navigation and surface interactions"
```

### Task 4: Dashboard and CRM interactions

**Files:**
- Modify: `app/(app)/page.tsx`
- Modify: `components/metric-card.tsx`
- Modify: `components/team-goal-progress.tsx`
- Modify: `components/kanban-board.tsx`
- Modify: `components/lead-card.tsx`
- Modify: `components/lead-detail-modal.tsx`
- Test: `tests/e2e/acceptance.spec.ts`
- Test: `tests/e2e/crm-modal.spec.ts`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

**Interfaces:**
- Consumes: Task 2 shared states and Task 3 shell treatment.
- Produces: polished dashboard/CRM feedback without changing funnel transitions, follow-ups, revenue values, deletion, or reporting data.

- [ ] **Step 1: Add modal motion-reversal coverage**

Extend `test('CRM keeps details private to an accessible modal and preserves lead actions')` to open a lead, assert its surface transitions `transform` and `opacity`, dismiss via Escape, reopen immediately, verify the same lead and focus are restored, and complete the existing stage-change path.

- [ ] **Step 2: Run the focused tests before implementation**

Run: `npm run test:e2e -- tests/e2e/crm-modal.spec.ts -g "CRM keeps details private to an accessible modal and preserves lead actions"`
Expected: the new transition-property assertion fails before implementation; existing lead action and focus behavior remains covered.

- [ ] **Step 3: Apply consistent interaction treatment**

Refine dashboard metric surfaces and CRM cards/modal with the same press, focus, status, and reversible-layer behavior. Keep modal semantics, stage update requests, loading/errors, and internal mobile board scrolling intact.

- [ ] **Step 4: Run dashboard and CRM regression paths**

Run: `npm run test:e2e -- tests/e2e/acceptance.spec.ts tests/e2e/crm-modal.spec.ts tests/e2e/crm-resume-and-trash.spec.ts tests/e2e/mobile-responsiveness.spec.ts`
Expected: dashboard, CRM, trash, follow-up, saved revenue, and phone viewport scenarios pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/page.tsx" components/metric-card.tsx components/team-goal-progress.tsx components/kanban-board.tsx components/lead-card.tsx components/lead-detail-modal.tsx tests/e2e/acceptance.spec.ts tests/e2e/crm-modal.spec.ts tests/e2e/mobile-responsiveness.spec.ts
git commit -m "feat: refine dashboard and CRM interactions"
```

### Task 5: Research and goals

**Files:**
- Modify: `app/(app)/pesquisa/page.tsx`
- Modify: `components/search-form.tsx`
- Modify: `app/(app)/metas/goal-center.tsx`
- Modify: `app/(app)/metas/goal-form.tsx`
- Modify: `app/(app)/metas/custom-goal-metrics.tsx`
- Modify: `app/(app)/metas/goal-importer.tsx`
- Test: `tests/e2e/acceptance.spec.ts`
- Test: `tests/e2e/goals-cycle.spec.ts`
- Test: `tests/e2e/goal-pdf-import.spec.ts`
- Test: `tests/e2e/research-to-crm.spec.ts`

**Interfaces:**
- Consumes: shared interactions from Tasks 2–3.
- Produces: consistent responsive form, progress-card, and import-review states without changing Overture/OSM requests, filters, goal persistence, custom indicator removal, or PDF parsing.

- [ ] **Step 1: Add interaction-state assertions to research and goal flows**

In `test('weekly and monthly goal tabs keep separate drafts and save their team targets')`, assert a custom-goal card's computed `transition-property` includes `transform` and `opacity`, then retain the existing navigation/reload/removal assertions. Keep the pending/retry assertions in `test('accumulates, deduplicates and reorders progressive search batches')` as the functional regression baseline.

- [ ] **Step 2: Run the focused tests to verify new assertions fail only where expected**

Run: `npm run test:e2e -- tests/e2e/acceptance.spec.ts tests/e2e/goals-cycle.spec.ts tests/e2e/goal-pdf-import.spec.ts tests/e2e/research-to-crm.spec.ts`
Expected: existing functional flows pass; the new card transition assertion fails until goal cards use the common treatment.

- [ ] **Step 3: Apply the shared treatment to search and goals**

Refine input labels, focus/press feedback, loading/error surfaces, period tabs, goal cards, manual indicator controls, and PDF review controls. Preserve all form names/labels used by assistive technology and existing tests. Do not change server-action or import behavior.

- [ ] **Step 4: Verify the focused research and goals suite**

Run: `npm test -- tests/unit/search-form.test.ts tests/unit/custom-goals.test.ts tests/unit/goal-actions.test.ts tests/unit/goal-import-state.test.ts tests/unit/goal-pdf.test.ts`
Run: `npm run test:e2e -- tests/e2e/acceptance.spec.ts tests/e2e/goals-cycle.spec.ts tests/e2e/goal-pdf-import.spec.ts tests/e2e/research-to-crm.spec.ts tests/e2e/mobile-responsiveness.spec.ts`
Expected: all data, save/remove, PDF import, and responsive assertions pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/pesquisa/page.tsx" components/search-form.tsx "app/(app)/metas/goal-center.tsx" "app/(app)/metas/goal-form.tsx" "app/(app)/metas/custom-goal-metrics.tsx" "app/(app)/metas/goal-importer.tsx" tests/e2e/acceptance.spec.ts tests/e2e/goals-cycle.spec.ts tests/e2e/goal-pdf-import.spec.ts tests/e2e/research-to-crm.spec.ts
git commit -m "feat: refine research and goal interactions"
```

### Task 6: Reports, profile, and login

**Files:**
- Modify: `app/(app)/relatorios/page.tsx`
- Modify: `app/(app)/relatorios/loading.tsx`
- Modify: `app/(app)/relatorios/error.tsx`
- Modify: `app/(app)/configuracoes/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `components/daily-close-control.tsx`
- Modify: `components/daily-report-view.tsx`
- Modify: `components/report-period-navigation.tsx`
- Modify: `components/report-pdf-download.tsx`
- Modify: `components/login-submit-button.tsx`
- Test: `tests/e2e/daily-close.spec.ts`
- Test: `tests/e2e/login-responsive.spec.ts`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`
- Test: `tests/unit/profile-layout.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–3 shared motion and surface tokens.
- Produces: consistent period switching, daily close/reopen, PDF download, profile save, and login feedback with unchanged handlers and payloads.

- [ ] **Step 1: Add accessibility-preference and status-state assertions**

Extend `test('reopens a closed day, preserves CRM activities, and allows a fresh close')` to assert the `Confirmar reabertura do dia` panel has a `transform`/`opacity` transition and can be canceled/reopened without delay. Keep `test('mobile login shows immediate feedback and blocks repeat taps while authentication is pending')` as the login pending-state regression.

- [ ] **Step 2: Run the focused tests before implementation**

Run: `npm run test:e2e -- tests/e2e/daily-close.spec.ts tests/e2e/login-responsive.spec.ts -g "reopens a closed day|mobile login shows immediate feedback"`
Expected: the new panel transition assertion fails before implementation; day-close/reopen and login pending behavior remains covered.

- [ ] **Step 3: Apply the shared treatment**

Refine report period controls, loading/error states, daily-close/reopen confirmation, PDF controls, profile form, and login submit feedback. Preserve labels, disabled/pending conditions, focus behavior, server actions, date/cycle calculations, and download output.

- [ ] **Step 4: Verify reports, profile, and login regressions**

Run: `npm test -- tests/unit/profile-layout.test.tsx tests/unit/daily-reports.test.ts`
Run: `npm run test:e2e -- tests/e2e/daily-close.spec.ts tests/e2e/login-responsive.spec.ts tests/e2e/login.spec.ts tests/e2e/mobile-responsiveness.spec.ts`
Expected: period changes, reversible day close, PDF export, profile save, login, and mobile layouts continue to pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/relatorios/page.tsx" "app/(app)/relatorios/loading.tsx" "app/(app)/relatorios/error.tsx" "app/(app)/configuracoes/page.tsx" app/login/page.tsx components/daily-close-control.tsx components/daily-report-view.tsx components/report-period-navigation.tsx components/report-pdf-download.tsx components/login-submit-button.tsx tests/e2e/daily-close.spec.ts tests/e2e/login-responsive.spec.ts tests/e2e/mobile-responsiveness.spec.ts tests/unit/profile-layout.test.tsx
git commit -m "feat: refine reports profile and login interactions"
```

### Task 7: Regression, GitHub push, and Vercel release

**Files:**
- Do not add: `.next-task2-sales/`, `.next-verification-pdf/`, or other generated caches.

**Interfaces:**
- Consumes: all completed and focused-tested design tasks above.
- Produces: tested commits on `feat/atelier-approach-mvp`, pushed to the configured GitHub remote, followed by a ready production Vercel deployment.

- [ ] **Step 1: Run static checks and the full unit suite**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm test`
Expected: typecheck/lint pass; unit tests pass except any recorded pre-existing failures, which must be compared against the known baseline below and confirmed not introduced by this work.

- [ ] **Step 2: Run the full E2E and production build**

Run: `npm run test:e2e`
Run: `npm run build`
Expected: all E2E tests and production build pass; if local Next/Prisma startup hits the previously observed timeout or Windows DLL lock, capture diagnostics and use the successful Vercel build as separate deployment evidence rather than claiming local success.

- [ ] **Step 3: Review and push only intended commits**

Run: `git diff --check` and `git status --short`; verify no generated cache is staged. Commit the approved plan file with `git add docs/superpowers/plans/2026-10-04-apple-design-system.md` and `git commit -m "docs: add Apple design implementation plan"`. Push the current branch with `git push origin feat/atelier-approach-mvp`.
Expected: GitHub has the approved existing goal work and Apple-inspired UI changes on the feature branch; no deployment until the production build is verified.

- [ ] **Step 4: Publish and verify production**

Use the Vercel CLI deployment workflow for the linked `sistema-pesquisa` project and production domain. Verify deployment state is `READY`, the alias remains `https://sistema-pesquisa-xi.vercel.app`, and unauthenticated `/login` returns HTTP 200.

## Known Baseline Before Implementation

- The latest full Vitest run had 286 passing, 3 skipped, and 12 failing tests outside goal UI/persistence work: route/report/metrics mocks omit Prisma methods or updated enum values. The approved goal changes will be checkpointed in Task 1; re-run and ensure the Apple-inspired work adds no new failures.
- The latest focused Playwright run timed out waiting for its local Next web server before a test began. Diagnose current server setup during Task 7; do not count a startup timeout as an assertion failure or as a passing E2E run.
- The branch already contains four approved commits ahead of its GitHub upstream plus the local design-spec commit. Preserve them and push them only with this user's requested system update.
