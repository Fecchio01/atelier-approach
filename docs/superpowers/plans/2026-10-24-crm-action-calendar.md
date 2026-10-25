# CRM action calendar implementation plan

> **For agentic workers:** follow `superpowers:executing-plans` task by task. Keep implementation within the approved design and preserve unrelated worktree changes.

**Goal:** Add a calendar view to CRM Actions, using the existing shared task and follow-up queue without changing persistence or automation semantics.

**Architecture:** Extend `CrmActionQueue` with a list/calendar view switch. Derive calendar cells from the already filtered `visibleItems`; add pure São Paulo calendar-day helpers and extend the existing form with an optional prefilled due date. Reuse current task mutation endpoints and the existing lead-opening workflow for both event types.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, existing `/api/crm/tasks` API.

## Global Constraints

- Do not alter Prisma schema, migrations, API routes, follow-up behavior, or automation rules.
- Do not copy or create separate task/follow-up records for the calendar.
- All calendar grouping and labels use `America/Sao_Paulo`; persisted due dates remain UTC.
- Preserve existing list view, filters, polling, authorization, optimistic/error behavior, and lead modal callback.
- Stage only the files in this plan plus the approved design document; leave all unrelated modified/untracked artifacts untouched.
- Do not add or run tests unless requested. Typecheck/build and manual visual verification are allowed as release checks.

## Review Focus

- Calendar day keys must not shift near midnight or across browser time zones.
- List and calendar must derive from the same filtered queue.
- Mobile uses a single-day agenda without horizontal scrolling; desktop uses a Monday-first week.
- Follow-up events must only open the existing company workflow; they must not gain task-only mutations.
- Creating an action from a selected day must prefill a São Paulo local date/time without changing form/API date semantics.

## Tasks

### Task 1 — Add São Paulo calendar date helpers

**Files:**
- Create `lib/crm-calendar.ts`

**Implementation:**
- Add helpers to derive `YYYY-MM-DD` from an instant in `America/Sao_Paulo`, safely add calendar days to a day key, return the Monday-first week containing a day key, and format day/weekday labels without browser-local timezone drift.
- Keep the helper API limited to functions needed by the calendar component; validate day keys and handle invalid input without throwing.
- Use UTC noon only as a stable carrier for formatting a calendar day key; do not interpret persisted event instants in UTC for grouping.

**Verification:** inspect midnight-adjacent examples by reasoning through the `America/Sao_Paulo` conversion, then run project typecheck/build after all tasks.

### Task 2 — Prefill the existing task form from a calendar day

**Files:**
- Modify `components/crm-task-form.tsx`

**Implementation:**
- Add optional `initialDueDate` in the form's existing `datetime-local` wall-clock format (`YYYY-MM-DDTHH:mm`).
- Initialize the due date from `initialTask` first, then `initialDueDate`, and otherwise preserve the current blank default.
- Keep existing parser, validation, POST/PATCH payloads, and UTC persistence unchanged.

**Verification:** inspect the form paths to confirm edit mode still overrides prefill and submit still uses `parseCrmTaskLocalDateTime`.

### Task 3 — Add responsive calendar view to the shared actions queue

**Files:**
- Modify `components/crm-action-queue.tsx`

**Implementation:**
- Add accessible **Lista** / **Calendário** controls without removing the existing list.
- Add selected-day state and Today / previous / next navigation. Desktop navigation moves by weeks; mobile agenda navigation moves by days.
- On desktop, render a Monday-first seven-day week; render one selected-day agenda on small viewports. Show each event's local time, company, description, type, and distinct task/follow-up styling.
- Use `visibleItems` as the only calendar data source, so assignment and period filters remain combinable and consistent with list view.
- Provide a day-level **Nova ação** entry point. It selects that date, opens the existing form, and passes a 09:00 São Paulo wall-clock prefill. Keep the global create action for an unselected date.
- Calendar task entries link to the same company detail flow and expose the same edit, complete, and cancel actions as list entries. Calendar follow-ups open the company detail flow and expose no task-only action.
- Preserve existing polling, request/mutation state, errors, labels and mobile touch sizing.

**Verification:** inspect all view/filter/navigation interactions, ensure no horizontal scrolling on the mobile branch, and confirm both views update from the same refresh/mutations.

### Task 4 — Release checks, commit, push, and deploy

**Files:**
- Include the implementation files above and `docs/superpowers/specs/2026-10-24-crm-action-calendar-design.md`
- Include this plan at `docs/superpowers/plans/2026-10-24-crm-action-calendar.md`

**Implementation:**
- Review the staged diff and keep pre-existing changes out of the commit.
- Run the project typecheck and attempt the local production build (not the test suite). If local build resources are exhausted, rely on the Vercel production build and read its result as the deployment build verification.
- Commit the coherent calendar feature with a descriptive message.
- Fetch `origin/main`; if it remains an ancestor of this feature commit, push the commit to the feature branch and fast-forward the default branch. Never force-push or overwrite divergence.
- Deploy the exact committed revision to the linked Vercel production project from a clean checkout and verify deployment status `READY` and the production alias.

**Verification:** record the commit hash, branches pushed, and Vercel deployment status/URL.
