# CRM Lifecycle Scheduled Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the existing CRM lifecycle processor once daily on Vercel, even when no one opens the app, while preserving its current rules and page-request catch-up.

**Architecture:** Add a protected GET route that invokes `processCrmLifecycleForPageRequest()` and returns only its operational counts. Configure that endpoint as a daily Vercel Cron at 03:00 UTC; keep the existing dashboard and CRM invocations as catch-up paths. The route fails closed when `CRON_SECRET` is missing or invalid.

**Tech Stack:** Next.js 15 App Router route handler, TypeScript, Vitest, Vercel Cron (`vercel.json`), existing Prisma lifecycle processor.

**Spec:** `docs/superpowers/specs/2026-10-16-crm-lifecycle-scheduled-processing-design.md`

## Global Constraints

- Keep the existing durations: 2 days in Abordado, 5 days in Proposta enviada, 5 days after completing Follow-up, and 7 days in Lixeira.
- Run daily at `03:00 UTC`; compare persisted server timestamps and process all currently overdue items.
- Require `Authorization: Bearer <CRON_SECRET>` before processing; absent or invalid secret returns `401` without touching the database.
- Reuse the processor already called from Painel and CRM; retain both request-time catch-up paths.
- Return only counts for Follow-up moves, inactivity discards, and permanent deletions; do not expose lead data or secrets.
- Keep notices inside the app; send no mobile, push, email, WhatsApp, or SMS notifications.
- Add no paid service, database table, dependency, schedule UI, or data migration.
- Only currently discarded leads with a trustworthy `discardedAt` at least seven days old may be permanently deleted.

## Review Focus

- Missing or incorrect `CRON_SECRET`: route must return `401` and never invoke the processor (Task 1 tests).
- Correct token but lifecycle processor failure: route must return generic `500`, log the failure without exposing secret/company data, and preserve the catch-up mechanism (Task 1 tests; Task 3 verification).
- Repeated/concurrent calls: lifecycle processing must remain idempotent and not override manual advancement (existing processor tests plus Task 3 verification).
- Leads becoming due while the app is unused: next scheduled run catches up without early action (Task 2 schedule validation and existing processor tests).
- Public response accidentally exposing business data: response schema contains only the three counts (Task 1 tests).

---

### Task 1: Add a protected lifecycle processing route

**Files:**
- Create: `app/api/cron/crm-lifecycle/route.ts`
- Test: `tests/unit/crm-lifecycle-cron-route.test.ts`
- Reuse: `lib/crm-lifecycle-page-request.ts`

**Interfaces:**
- Consumes: `processCrmLifecycleForPageRequest(): Promise<{ movedToFollowUp: number; discardedForInactivity: number; permanentlyDeleted: number }>`.
- Produces: `GET(request: Request): Promise<Response>` at `/api/cron/crm-lifecycle`.

- [ ] **Step 1: Write route tests first**

Test that a valid `Authorization: Bearer <CRON_SECRET>` invokes the existing processor once and returns status `200` with only its three counts. Test absent secret, absent header, malformed bearer header, and incorrect token return `401` without invoking processing. Test missing server secret also fails closed. Test processor rejection returns a generic `500` body without the secret or lead data.

- [ ] **Step 2: Run the route test and confirm it fails**

Run: `npm test -- tests/unit/crm-lifecycle-cron-route.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the GET handler**

In `app/api/cron/crm-lifecycle/route.ts`, read `CRON_SECRET`, require an exact Bearer token match before calling the shared page-request processor, and return only the three processing counts. Return `401` for all authentication failures. Catch processor errors, log a generic operational error without credentials or lead details, and return a generic `500` response. Do not add session authentication or duplicate lifecycle logic.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- tests/unit/crm-lifecycle-cron-route.test.ts`
Expected: PASS for authorization, no-mutation-on-auth-failure, successful count-only response, and generic failure response.

- [ ] **Step 5: Commit the route and its tests**

```bash
git add app/api/cron/crm-lifecycle/route.ts tests/unit/crm-lifecycle-cron-route.test.ts
git commit -m "feat: add protected CRM lifecycle cron endpoint"
```

### Task 2: Schedule the endpoint daily on Vercel

**Files:**
- Modify: `vercel.json`
- Reuse: `app/api/cron/crm-lifecycle/route.ts`

**Interfaces:**
- Vercel Cron sends an authenticated GET request to `/api/cron/crm-lifecycle` using the configured `CRON_SECRET`.
- The schedule is `0 3 * * *` (daily at 03:00 UTC).

- [ ] **Step 1: Add the daily cron configuration**

Add one `crons` entry to `vercel.json` with `path` `/api/cron/crm-lifecycle` and schedule `0 3 * * *`. Preserve the existing schema and `gru1` region configuration. Do not add a second schedule or modify the lifecycle rules.

- [ ] **Step 2: Validate the Vercel configuration and route build**

Run: `npx vercel build`
Expected: the project builds and Vercel accepts the cron configuration; no unrelated deployment or environment values are changed.

- [ ] **Step 3: Commit the schedule**

```bash
git add vercel.json
git commit -m "feat: schedule daily CRM lifecycle processing"
```

### Task 3: Verify lifecycle compatibility and production operation

**Files:**
- Test: `tests/unit/lead-lifecycle-processor.test.ts`
- Test: `tests/unit/crm-lifecycle-cron-route.test.ts`
- Verify: `app/(app)/page.tsx`, `app/(app)/crm/page.tsx`, `vercel.json`
- Configure outside Git: Vercel environment variable `CRON_SECRET` for Preview and Production (never place its value in a tracked file).

**Interfaces:**
- Both existing page routes continue to call `processCrmLifecycleForPageRequest()`.
- The Vercel cron route uses that same processor and returns only count fields.

- [ ] **Step 1: Run focused lifecycle and route tests**

Run: `npm test -- tests/unit/lead-lifecycle-processor.test.ts tests/unit/crm-lifecycle-cron-route.test.ts tests/unit/crm-lifecycle-page-request.test.ts`
Expected: PASS, including existing two-/five-day follow-up thresholds, five-day post-completion discard, seven-day retention, and concurrent/idempotent processing.

- [ ] **Step 2: Run project verification**

Run: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
Expected: all commands pass. Investigate any failure against this change and avoid modifying unrelated dirty files.

- [ ] **Step 3: Configure and deploy safely**

Ensure `CRON_SECRET` is present in the Vercel Preview and Production environments before testing or enabling the schedule; do not display or commit its value. Push the verified commits to GitHub using the repository's established branch workflow and deploy/promote the verified commit to Vercel production. Confirm the deployment is Ready and Vercel lists the cron at `/api/cron/crm-lifecycle` with the daily schedule. Do not manually invoke the production endpoint if doing so could process real due leads; use the protected Preview environment for an authenticated invocation and verify the production route rejects unauthenticated requests.

- [ ] **Step 4: Commit any necessary verification-only correction**

If verification exposes a required code correction, add a regression test, fix only the scoped issue, rerun its focused test and relevant project checks, then commit that correction separately. If no correction is needed, no extra commit is required.
