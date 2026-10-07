# Arvello Motion and Three.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restrained, accessible Motion interactions and one optional Three.js dashboard accent without changing business logic or delaying navigation.

**Architecture:** Introduce shared motion primitives/tokens for existing client interactions, then integrate only into the dashboard, progress indicators, and existing CRM detail/funnel interactions. Build the dashboard accent as an isolated, lazily loaded client component with static/mobile/reduced-motion fallback and complete renderer cleanup.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `motion/react`, Three.js, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-motion-threejs-design.md`

## Global Constraints

- Preserve Arvello's dark palette, lime accent, typography, logo, spacing, and responsive layouts.
- Navigation and route changes must never wait for an animation; no artificial delay or blocked input.
- The dashboard must remain completely usable without WebGL.
- Respect `prefers-reduced-motion`; use static presentation for the Three.js accent in that mode.
- Keep the Three.js visual dashboard-only, decorative, lazy-loaded, non-focusable, and `aria-hidden`.
- Pause Three.js rendering when hidden/offscreen, cap pixel ratio and scene complexity, and dispose GPU/listener/frame resources on unmount.
- Do not alter CRM, goal, report, persistence, API, or database behavior.

## Review Focus

- Reduced-motion users should get no nonessential animation; test Motion and scene fallback.
- WebGL unavailable or scene initialization failing must not break the dashboard; test static fallback.
- Navigation during/after dialog or card transitions remains immediate and cleanup-safe; exercise route changes.
- Mobile rendering must not overflow or intercept touch; verify at narrow viewport and touch interactions.
- Hidden/offscreen canvas must stop rendering and dispose resources when removed; verify lifecycle behavior.

## File Structure

- `package.json`, lockfile: add Motion and Three.js runtime dependencies plus Three.js type definitions.
- `.gitignore`: exclude the dedicated local production-build output without altering existing user caches.
- `vitest.config.ts`, `vitest.motion.config.ts`: CommonJS interop for runner mode and isolated no-database visual unit tests.
- `components/motion-primitives.tsx`: shared Motion wrappers for presentational state changes only.
- `components/dashboard-period-selector.tsx`: client-island segmented control that keeps period navigation as ordinary links.
- `components/app-shell.tsx`: shared `MotionConfig` reduced-motion policy for app interactions.
- `components/dashboard-ambient-scene.tsx`: lightweight responsive gate and always-present static fallback.
- `components/dashboard-three-canvas.tsx`: dynamically loaded Three.js canvas, visibility and cleanup lifecycle.
- `app/(app)/page.tsx`: mount lazy scene and animate dashboard period/progress state without changing server data flow.
- `components/team-goal-progress.tsx`: animate progress fill while preserving values and accessible progress semantics.
- `components/lead-detail-modal.tsx`: brief enter/exit treatment for existing dialog without changing close/focus semantics.
- `components/kanban-board.tsx`: animate visual layout changes after existing successful stage updates; do not change persistence or drag behavior.
- `tests/unit/motion-primitives.test.tsx`, `tests/unit/dashboard-ambient-scene.test.tsx`: unit coverage for reduced-motion/static fallback and accessible decorative presentation.
- `tests/e2e/dashboard-motion.spec.ts`: end-to-end checks for dashboard navigation, responsive behavior, and reduced-motion.

### Task 1: Shared motion foundation and interactions

**Files:**
- Modify: `package.json`, package lock, `vitest.config.ts`, `.gitignore`
- Create: `components/motion-primitives.tsx`
- Create: `components/dashboard-period-selector.tsx`
- Modify: `components/app-shell.tsx`, `app/(app)/page.tsx`, `components/team-goal-progress.tsx`, `components/lead-detail-modal.tsx`, `components/kanban-board.tsx`
- Create: `vitest.motion.config.ts`
- Test: `tests/unit/motion-primitives.test.tsx`, `tests/e2e/dashboard-motion.spec.ts`

**Interfaces:**
- Produces: named, client-side motion primitives whose default duration/easing are centralized and whose reduced-motion behavior is static; no primitive may own navigation or business state.

- [ ] **Step 1: Write failing tests** asserting motion wrappers render their children and preserve static semantics under reduced motion; add E2E coverage that period links navigate immediately, dialog opens/closes accessibly, and mobile dashboard has no horizontal overflow.
- [ ] **Step 2: Run the focused tests** and confirm they fail because the primitives and motion behavior are absent.
- [ ] **Step 3: Add `motion` and implement primitives** using `motion/react`, shared short-duration tokens, and `useReducedMotion`; use `AnimatePresence` only for genuine enter/exit UI.
- [ ] **Step 4: Integrate selected state transitions** in dashboard period selection, goal progress fills, modal entry/exit, and already-successful funnel stage updates. Retain server rendering and existing click/API/router flow.
- [ ] **Step 5: Run focused tests, then `npm run typecheck` and `npm test`; verify existing navigation and CRM tests remain unchanged and passing.**

### Task 2: Lazy, resilient dashboard Three.js accent

**Files:**
- Modify: `package.json`, package lock
- Create: `components/dashboard-ambient-scene.tsx`, `components/dashboard-three-canvas.tsx`
- Modify: `app/(app)/page.tsx`
- Test: `tests/unit/dashboard-ambient-scene.test.tsx`, `tests/e2e/dashboard-motion.spec.ts`

**Interfaces:**
- Produces: a decorative component that accepts no business data and renders either an `aria-hidden` canvas or a static fallback; it never captures pointer/touch input.

- [ ] **Step 1: Write failing tests** for decorative accessibility, fallback when reduced motion is enabled, and a usable static scene when WebGL is unavailable.
- [ ] **Step 2: Run the focused tests** and confirm expected failure before creating the scene.
- [ ] **Step 3: Add `three` and implement a small palette-matched scene** with capped pixel ratio, no browser-only work during SSR, and reduced-motion/mobile/static fallback.
- [ ] **Step 4: Add lazy client-only loading on the dashboard** with a stable static placeholder; pause on `visibilitychange` and `IntersectionObserver` exit, and dispose renderer/geometries/materials/listeners/RAF on unmount or initialization failure.
- [ ] **Step 5: Run unit and E2E tests**, check dashboard/CRM route transitions and desktop/mobile screenshots, then run `npm run lint`, `npm run typecheck`, `npm test`, and production build.

### Task 3: Production release

**Files:**
- No application source changes; use current branch and configured Vercel project only.

- [ ] **Step 1: Inspect final diff and run verification**; confirm no unrelated files or business logic changed.
- [ ] **Step 2: Commit and push the verified changes** to the current GitHub branch.
- [ ] **Step 3: Deploy to the existing `sistema-pesquisa` Vercel project** and confirm deployment status is READY at `https://sistema-pesquisa-xi.vercel.app`.

---

## Self-review

- All spec goals map to Tasks 1–3: shared Motion behavior and reduced-motion to Task 1; isolated lazy Three.js fallback/lifecycle to Task 2; complete validation and publish to Task 3.
- No task changes navigation state, CRM persistence, API contracts, or the logo; visual interaction is progressive enhancement.
- Accessibility, mobile sizing, reduced motion, WebGL failure, visibility pause, and resource cleanup are explicit test/review criteria.
