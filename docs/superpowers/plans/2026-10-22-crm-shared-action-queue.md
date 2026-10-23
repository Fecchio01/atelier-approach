# CRM Shared Action Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted, team-shared CRM action queue that combines explicit tasks with existing pending follow-ups without changing follow-up lifecycle behavior.

**Architecture:** Add a Prisma-backed `CrmTask` model and authenticated API with server-derived actor IDs, member/lead validation, transactional activity history, and conditional updates. Add an Actions view to `/crm`, combining tasks and follow-ups, with filters and task creation/editing from both the queue and lead detail.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma/PostgreSQL, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-22-crm-shared-action-queue-design.md`

## Global Constraints

- Preserve the existing `FollowUp` model, endpoint behavior, and automation rules.
- All task reads and writes require an authenticated session; actor IDs come from `getCurrentUser()`.
- All authenticated team members can see and operate on shared tasks; assignee is accountability, not access control.
- Persist due dates as UTC and render/filter by `America/Sao_Paulo`.
- Do not send external WhatsApp, phone, email, or calendar actions.
- Keep computed dashboard “Ações pendentes” separate from persisted tasks.
- Apply RLS and app-role grants to the new table, following existing migration policy patterns.

## Review Focus

- A malformed or invalid date, unknown lead, or unknown assignee must be rejected without partial records or activity rows.
- Two members completing or editing the same task must not create duplicate completion events or silently overwrite a newer reschedule.
- A task or follow-up due near midnight must be categorized by the São Paulo calendar day, including daylight-saving-safe timezone handling.
- Cancelled/completed tasks must not reappear as pending after refresh or cross-device polling.
- Empty states, long company names, keyboard controls, and the create/edit form must remain usable on narrow mobile screens.

---

### Task 1: Persisted task model and queue domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261022000000_crm_shared_action_queue/migration.sql`
- Create: `lib/crm-task-queue.ts`
- Test: `tests/unit/crm-task-queue.test.ts`

**Interfaces:**
- Produces: `CrmTaskType`, `CrmTaskPriority`, and `CrmTaskState` Prisma enums; `CrmTask` model; `parseCrmTaskCreateInput(value)` and `filterAndSortCrmQueue(items, filters, now)`.
- Queue item types distinguish `TASK` from `FOLLOW_UP`; filter keys are `assigneeId` (optional) and `period` (`ALL`, `OVERDUE`, `TODAY`, `FUTURE`).

- [ ] **Step 1: Write failing domain tests** for valid/invalid create input, same-day São Paulo boundaries, combinable assignee/period filters, overdue-first sorting, earliest due time, and priority tie-breaks.
- [ ] **Step 2: Run** `npx vitest run tests/unit/crm-task-queue.test.ts` and confirm it fails because the domain module is missing.
- [ ] **Step 3: Implement** the enums/model (including `CRM_TASK_CREATED`, `CRM_TASK_UPDATED`, `CRM_TASK_COMPLETED`, `CRM_TASK_CANCELLED` activity types) with creator/editor/completion/cancellation audit fields and indexes; add a PostgreSQL migration enabling RLS, `atelier_app` policies/grants, and the pure validation/filter/sort functions.
- [ ] **Step 4: Run** `npx prisma validate` and `npx vitest run tests/unit/crm-task-queue.test.ts`; expect both to pass.
- [ ] **Step 5: Commit** schema, migration, domain module, and focused tests.

### Task 2: Authenticated shared-task API

**Files:**
- Create: `app/api/crm/tasks/route.ts`
- Create: `app/api/crm/tasks/[id]/route.ts`
- Test: `tests/unit/crm-task-routes.test.ts`
- Modify: `prisma/schema.prisma` only if generated client typing requires no additional model change.

**Interfaces:**
- Consumes: Task 1 parser and queue-item helpers.
- Produces: `GET /api/crm/tasks` returning pending explicit tasks, pending follow-ups, and public member choices; `POST /api/crm/tasks`; `PATCH /api/crm/tasks/:id` for edit, reassign, reschedule, complete, or cancel.

- [ ] **Step 1: Write failing route tests** for unauthenticated rejection, spoofed actor IDs, invalid lead/member references, create + activity transaction, aggregation with existing pending follow-ups, idempotent completion, cancellation, and stale concurrent update conflict.
- [ ] **Step 2: Run** `npx vitest run tests/unit/crm-task-routes.test.ts` and confirm expected missing-route failures.
- [ ] **Step 3: Implement** the endpoints. Use transactions for task/activity writes; use state/`updatedAt`-conditional updates for concurrency; preserve existing follow-up APIs; expose only member `id`/`name` in assignment choices.
- [ ] **Step 4: Run** `npx vitest run tests/unit/crm-task-routes.test.ts tests/unit/crm-task-queue.test.ts`; expect all to pass. The legacy `lead-routes` integration suite additionally depends on the hosted test schema containing the already-migrated `Lead.meetingAt` column.
- [ ] **Step 5: Commit** endpoints and tests.

### Task 3: CRM actions view and task management

**Files:**
- Create: `components/crm-action-queue.tsx`
- Create: `components/crm-task-form.tsx`
- Create: `lib/crm-task-datetime.ts`
- Modify: `app/(app)/crm/page.tsx`
- Test: `tests/unit/crm-action-queue.test.tsx`, `tests/unit/crm-task-datetime.test.ts`

**Interfaces:**
- Consumes: Task 1 queue/filter types and Task 2 list/create/update endpoints.
- Produces: “Funil” and “Ações” CRM views; all-team / assigned-to-me toggle; combinable period filters; task creation and inline update/reassign/reschedule/complete/cancel; follow-up rows that deep-link to the lead and retain existing completion/reschedule controls.

- [ ] **Step 1: Write failing component tests** for view switch, filters, ordering, task and follow-up distinction, visible completion/edit/cancel controls, creation form fields, and responsive states; test São Paulo date-time conversion independently.
- [ ] **Step 2: Run** `npx vitest run tests/unit/crm-action-queue.test.tsx` and confirm the component is missing.
- [ ] **Step 3: Implement** the queue, reusable responsive create/edit form, and São Paulo date-time formatter/converter; poll only while the Actions view is visible and refresh after successful mutations; keep dashboard alerts unchanged.
- [ ] **Step 4: Run** the focused component tests and relevant CRM UI tests; expect all to pass.
- [ ] **Step 5: Commit** the queue view and tests.

### Task 4: Create actions from company detail and final integration

**Files:**
- Modify: `components/lead-detail-modal.tsx`
- Modify: `components/kanban-board.tsx`
- Modify: `app/(app)/crm/page.tsx`
- Test: `tests/unit/crm-task-entry-points.test.tsx`

**Interfaces:**
- Consumes: Task 2 create endpoint and Task 3 form/queue components.
- Produces: A task-creation entry point prefilled with the currently open company; successful create leaves the lead modal usable and the shared queue refreshable across members/devices.

- [ ] **Step 1: Write failing tests** proving the company-detail entry point passes the lead ID/name, saves with server-owned creator identity, and does not alter existing follow-up actions.
- [ ] **Step 2: Run** `npx vitest run tests/unit/crm-task-entry-points.test.tsx` and confirm the entry point is missing.
- [ ] **Step 3: Implement** the detail-modal action and wire it to the shared form/queue refresh contract.
- [ ] **Step 4: Run** focused tests plus `npm run typecheck`, `npm run lint`, and `npm test`; expect zero errors/failures.
- [ ] **Step 5: Commit** the final UI integration and tests.

### Task 5: Production verification, review, GitHub, and Vercel

**Files:**
- Modify only any files required by verified findings; do not stage unrelated dirty workspace files.

**Interfaces:**
- Consumes: Completed tasks 1–4 and the approved spec.
- Produces: Green production build, migration deployment readiness, final commit pushed to the feature branch, and a successful Vercel production deployment.

- [ ] **Step 1: Run** `npm run build` and review the complete diff and generated Prisma migration.
- [ ] **Step 2: Verify** the linked Supabase database/project and Vercel project/production target before applying the new migration and deploying; never expose credentials.
- [ ] **Step 3: Run** the whole test/type/lint/build suite after any review fixes.
- [ ] **Step 4: Commit** any verified fixes, push the feature branch, deploy production on Vercel, and confirm deployment status/URL.

