# CRM Collaboration and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale manual stage changes from overwriting a teammate’s update and show the responsible member’s name in each CRM activity entry.

**Architecture:** Use optimistic concurrency on stage transitions by comparing the client’s expected stage and `stageEnteredAt` with the persisted lead in an atomic conditional write. Keep the existing transaction and audit records. Enrich the existing detail response with member names resolved from `MemberProfile`; render a neutral fallback when an author profile is unavailable.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 6, PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-crm-collaboracao-auditoria-design.md`

## Global Constraints

- For a manual stage change, compare both the expected stage and expected `stageEnteredAt`.
- A stale change returns HTTP `409` and creates no partial lead, activity, follow-up, stage-history, or sale changes.
- Preserve existing stage rules, follow-up timings, lifecycle processing, polling, and internal-only reminders.
- Resolve names from existing `MemberProfile`; do not add a database table, Prisma relation, migration, dependency, or paid service.
- Do not include member emails or avatar data in activity payloads.
- Preserve all unrelated local changes and generated files in the worktree.

## Review Focus

- Two clients submit different stages from the same initial stage/timestamp: exactly one transition succeeds and the other receives `409`.
- A stale request is made after the record leaves and later returns to the same stage: the changed timestamp still rejects the old state.
- Missing or invalid expected stage/timestamp on a stage-changing request: return `400` before any write.
- A referenced member profile is missing: the timeline remains usable and shows “Membro da equipe”.
- A conflict response updates the open company details without silently retrying the requested transition; the board refresh remains compatible with existing polling.

---

### Task 1: Protect stage transitions against stale updates

**Files:**
- Modify: `app/api/leads/[id]/route.ts`
- Modify: `components/lead-detail-modal.tsx`
- Modify: `tests/unit/lead-routes.test.ts`
- Modify: `tests/unit/lead-sale-concurrency.test.ts`
- Modify: `tests/e2e/commercial-controls.component.spec.ts`

**Interfaces:**
- Stage-changing PATCH requests consume `expectedStage: LeadStage` and `expectedStageEnteredAt: string` in addition to the desired `stage`.
- Success retains the current response shape.
- A stale request produces HTTP `409` with `{ code: 'STAGE_CONFLICT', currentStage: LeadStage, currentStageEnteredAt: string }`.
- Invalid or missing expected-state fields on a stage-changing request produce HTTP `400` with a safe Portuguese error.

- [ ] **Step 1: Add failing route tests for expected-state validation and stale writes**

In `tests/unit/lead-routes.test.ts`, add a test helper that reads the current stage and `stageEnteredAt` for ordinary stage-change requests, and assert that a missing or invalid expected state returns `400` without writes. Add a stale `stageEnteredAt` case where current stage matches but its entry timestamp differs; assert `409`, `STAGE_CONFLICT`, no new `StageHistory`, and no side-effect records. Update existing stage-transition fixtures to use the helper; leave non-stage PATCH fixtures unchanged.

- [ ] **Step 2: Run route tests and verify the new cases fail**

Run: `npm test -- tests/unit/lead-routes.test.ts`
Expected: the new validation/conflict cases fail before implementation; existing unrelated assertions remain green.

- [ ] **Step 3: Add a parallel stage-transition regression test**

Create one lead and issue two concurrent requests using the same original `expectedStage` and `expectedStageEnteredAt`, with different target stages. Assert exactly one response is `200`, the other is `409`, the stored stage matches the successful target, exactly one transition and one transition activity were recorded, and any follow-up side effect exists only if the successful target was `FOLLOW_UP`.

In `tests/unit/lead-sale-concurrency.test.ts`, update the existing duplicate concurrent close scenario to send the same expected state in both requests and assert one successful close plus one `409`, while preserving its single-sale and single-history assertions.

- [ ] **Step 4: Run the parallel test and verify it exposes the race**

Run: `npm test -- tests/unit/lead-routes.test.ts`
Expected: the new concurrent-transition case fails against unconditional writes.

- [ ] **Step 5: Implement conditional stage update in the existing transaction**

In `app/api/leads/[id]/route.ts`, validate the expected state for stage changes. Use a conditional `updateMany` match on `id`, `expectedStage`, and `expectedStageEnteredAt`; proceed with stage history, activity, follow-up, and sale side effects only when exactly one row was updated. When no row matches, read the current stage/timestamp and return the specified `409` without retrying or creating side effects. Keep non-stage PATCH behavior unchanged.

- [ ] **Step 6: Send expected state and handle conflict in the CRM modal**

In `components/lead-detail-modal.tsx`, when `details.stage` is present, include the selected lead’s current stage and `stageEnteredAt`. On `STAGE_CONFLICT`, fetch the canonical detail, update the modal’s lead and stage draft, retain a clear “outra pessoa atualizou” message, and refresh the board. Do not automatically resubmit the original transition. Update stage-changing component fixtures to include `stageEnteredAt`.

- [ ] **Step 7: Add a component test for visible conflict recovery**

In `tests/e2e/commercial-controls.component.spec.ts`, return `409` for a stale stage PATCH and a fresh lead on the subsequent GET. Assert the conflict message appears, the fresh stage is shown, and the PATCH was not repeated.

- [ ] **Step 8: Run focused tests and commit the complete concurrency slice**

Run: `npm test -- tests/unit/lead-routes.test.ts tests/unit/lead-sale-concurrency.test.ts`
Run: `npx playwright test tests/e2e/commercial-controls.component.spec.ts`
Expected: route tests and the component scenario pass; no transition side effects are duplicated.

```bash
git add app/api/leads/[id]/route.ts components/lead-detail-modal.tsx tests/unit/lead-routes.test.ts tests/unit/lead-sale-concurrency.test.ts tests/e2e/commercial-controls.component.spec.ts
git commit -m "fix: reject stale CRM stage updates"
```

### Task 2: Show activity authors in the company timeline

**Files:**
- Modify: `app/api/leads/[id]/route.ts`
- Modify: `components/kanban-board.tsx`
- Modify: `components/lead-detail-modal.tsx`
- Modify: `tests/unit/lead-routes.test.ts`
- Modify: `tests/e2e/commercial-controls.component.spec.ts`

**Interfaces:**
- Detail activities add `actorName: string | null`; keep `actorId` for existing behavior.
- `null` means no matching `MemberProfile` exists and displays as “Membro da equipe”.
- No email or avatar values are returned on activity objects.

- [ ] **Step 1: Add a failing detail-route test for author resolution and privacy**

In `tests/unit/lead-routes.test.ts`, create a member profile and activity, call `GET /api/leads/:id`, and assert the activity includes the member name. Assert the serialized activity does not include `email` or `avatarUrl`.

- [ ] **Step 2: Run the route test and verify it fails**

Run: `npm test -- tests/unit/lead-routes.test.ts`
Expected: the route test fails because activity authors are not currently resolved.

- [ ] **Step 3: Resolve activity actor names in the detail response**

In `app/api/leads/[id]/route.ts`, collect unique activity `actorId` values, query only `{ id, name }` from `memberProfile`, and serialize `actorName` without changing stored history.

- [ ] **Step 4: Add author display and missing-profile fallback**

In `components/kanban-board.tsx`, extend the activity type with nullable `actorName`. In `components/lead-detail-modal.tsx`, render the resolved author in each history entry; when null or absent, render “Membro da equipe”. Do not render email or avatar.

- [ ] **Step 5: Test the timeline author and fallback rendering**

In `tests/e2e/commercial-controls.component.spec.ts`, cover one known actor and one missing profile. Assert the correct member name and neutral fallback appear in the activity timeline.

- [ ] **Step 6: Run focused verification and commit the audit display slice**

Run: `npm test -- tests/unit/lead-routes.test.ts`
Run: `npx playwright test tests/e2e/commercial-controls.component.spec.ts`
Expected: author resolution, privacy, and fallback assertions pass.

```bash
git add app/api/leads/[id]/route.ts components/kanban-board.tsx components/lead-detail-modal.tsx tests/unit/lead-routes.test.ts tests/unit/commercial-modal.test.tsx tests/e2e/commercial-controls.component.spec.ts
git commit -m "feat: show CRM activity authors"
```

### Task 3: Verify the integrated CRM slice

**Files:**
- Verify: `app/api/leads/[id]/route.ts`, `components/kanban-board.tsx`, `components/lead-detail-modal.tsx`
- Verify: tests from Tasks 1–2 and existing CRM lifecycle/dashboard suites

**Interfaces:**
- No new interface; validates the already specified conditional PATCH and enriched detail payload.

- [ ] **Step 1: Run the focused CRM/lifecycle suite**

Run: `npm test -- tests/unit/lead-routes.test.ts tests/unit/lead-sale-concurrency.test.ts tests/unit/crm-board-version.test.ts tests/unit/crm-board-version-route.test.ts tests/unit/lead-lifecycle-processor.test.ts tests/unit/dashboard-pending-actions.test.tsx`
Expected: all focused tests pass, including existing lifecycle and shared-board behavior.

- [ ] **Step 2: Run static checks and production build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: all checks pass without modifying unrelated worktree files.

- [ ] **Step 3: Review the final diff and commit any scoped correction separately**

Inspect `git diff` and `git status --short`; ensure only this feature’s source/tests are included in implementation commits. Do not stage pre-existing generated artifacts or unrelated local edits. If a required correction is found, add its regression test, rerun the relevant check, and make a separate focused commit.

- [ ] **Step 4: Publish the reviewed implementation**

Push the feature branch to the configured GitHub remote, deploy the verified commit to the linked Vercel project using the existing safe release path, and confirm the deployment is Ready. Do not run destructive lifecycle operations against production as part of deployment verification.

## Plan self-review

- Spec coverage: conditional stage/timestamp comparison, no partial side effects, `409` recovery without automatic retry, activity author resolution, missing-profile fallback, privacy, unchanged workflows, tests and build checks are covered by Tasks 1–3.
- The focused review cases are assigned to their owning route/UI tests; no schema or migration step is needed because `MemberProfile`, `Activity`, and `StageHistory` already exist.
- Task interfaces are consistent: the modal sends `expectedStage` and `expectedStageEnteredAt`; the route returns `STAGE_CONFLICT` with current persisted state; activity detail adds only nullable `actorName`.
- Scope remains one integrated CRM reliability slice; tasks are sequential because modal conflict handling depends on the API contract, while author rendering depends on the enriched detail response.
