# CRM bulk actions implementation plan

> **For agentic workers:** follow `superpowers:executing-plans` task by task. Keep implementation within the approved design and preserve unrelated worktree changes.

**Goal:** Let CRM members complete, cancel, or reassign multiple manual actions from the existing shared queue.

**Architecture:** Add an authenticated bulk mutation route that accepts task ids with their observed `updatedAt` versions. Within one transaction, conditionally update each pending task, write the corresponding activity event, and report concurrent changes as skipped. Add selection state and a compact toolbar to the queue's list view.

**Tech Stack:** Next.js 15 route handlers, Prisma transactions, React 19, existing `CrmTask`, `ActivityType`, and queue components.

## Global Constraints

- Operate on manual `CrmTask` rows only; automatic follow-ups and lead stages remain untouched.
- Use version checks and one transaction so a partial database failure rolls back the batch.
- Enforce authentication, strict input validation, and a maximum of 100 task ids.
- Keep individual actions, list/calendar filters, saved views, and polling behavior intact.
- Stage only files for this feature and preserve all pre-existing worktree changes.
- Do not add or run tests unless requested. Typecheck, lint, and production deployment verification are release checks.
- Commit and push to GitHub, fast-forward `main` only if it remains safe, deploy the committed revision to Vercel production, and verify READY.

## Review Focus

- Follow-ups are never selectable or mutated by the bulk endpoint.
- Stale task versions are skipped and reported instead of overwriting another teammate's update.
- Every changed task gets exactly one audit activity in the same transaction.
- Selection is limited to visible list tasks, clears when filters change, and cannot exceed the server limit.

## Tasks

### Task 1 — Add validated transactional bulk task API

**Files:**
- Create `app/api/crm/tasks/bulk/route.ts`

**Implementation:**
- Accept `COMPLETE`, `CANCEL`, or `REASSIGN` with 1–100 unique `{ id, updatedAt }` entries.
- Validate exact timestamps and assignee membership.
- In one Prisma transaction, update only pending rows whose `updatedAt` still matches and write the existing task activity types.
- Return updated, unchanged, and skipped counts without exposing other members' data.

**Verification:** inspect route authorization, stale-version predicates, transaction boundaries, audit notes, and response counts.

### Task 2 — Add list selection and bulk toolbar

**Files:**
- Modify `components/crm-action-queue.tsx`

**Implementation:**
- Add per-task checkboxes plus a select-visible control in list view only.
- Add bulk complete, cancel-with-confirmation, and reassign controls, with accessible status/error messages.
- Submit selected task versions, display partial-conflict counts, refresh the queue, and clear selection after filter changes or view changes.
- Clearly state the 100-task limit and that automatic follow-ups are excluded.

**Verification:** inspect selection/filter/calendar interactions, ensure follow-up cards never expose a checkbox, and confirm single-task actions remain available.

### Task 3 — Review, commit, push, and production deploy

**Implementation:**
- Run lint and typecheck; review only staged feature changes.
- Commit, push the feature and fast-forward `main` only if it has not diverged.
- Deploy the committed revision to the linked Vercel production project and inspect until READY.

**Verification:** report commit hash, pushed branches, Vercel status, and production URL.
