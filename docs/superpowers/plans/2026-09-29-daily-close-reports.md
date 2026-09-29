# Daily Close and Period Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a team-wide close-day action that saves an immutable daily report while preserving live weekly and configured monthly rollups from all CRM events.

**Architecture:** Store one Prisma `DailyReport` snapshot per São Paulo calendar day, created idempotently through an authenticated route. Calculate daily metrics directly from CRM events up to the close instant (not from the weekly/monthly report builder, which also includes current funnel state); add responsive close controls to the dashboard and reports page plus an archived daily-report view.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 6/PostgreSQL (Supabase), Vitest, Playwright, Cloudflare Quick Tunnel for the existing local preview.

**Spec:** `docs/superpowers/specs/2026-09-29-daily-close-reports-design.md`

## Global Constraints

- Preserve existing CRM activity, goal, funnel, and weekly/monthly report semantics.
- Preserve the existing reports and metrics; weekly and monthly remain calculated from CRM base records.
- Use the `America/Sao_Paulo` calendar for daily boundaries and the company-configured cycle for monthly reports.
- A daily snapshot represents records available when “Fechar o dia” is used; later records do not change it.
- The daily close is unique for the team by local date; repeating it returns the saved report.
- Keep the app responsive and usable on computer and mobile.
- The only Cloudflare target in this checkout is the existing temporary Quick Tunnel; preserve its URL/process if available and do not claim a permanent Pages/Workers deployment.
- Commit and push each completed implementation task to `origin/feat/atelier-approach-mvp`, as previously requested.

## Review Focus

- Duplicate or concurrent close requests — Task 1 tests that the unique local-day key returns one stored snapshot.
- São Paulo midnight and UTC date rollover — Task 1 tests event inclusion at the local-day boundary and close instant.
- Activity after closure — Task 1 tests the saved snapshot remains unchanged while the live period report includes the event.
- Empty day or missing member/lead profile — Task 1 tests zero totals and fallback labels.
- Mobile viewport — Task 2 tests close, archive and report details without horizontal overflow.

---

### Task 1: Persist and generate daily report snapshots

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260929000000_daily_report_snapshot/migration.sql`
- Modify: `lib/reports.ts`
- Create: `lib/daily-reports.ts`
- Modify: `app/api/reports/route.ts`
- Modify: `tests/unit/reports.test.ts`
- Create: `tests/unit/daily-reports.test.ts`
- Modify: `tests/setup-test-database.ts`

**Interfaces:**
- Consumes: `getLocalDayWindow(reference)` from `lib/goal-periods.ts` and `getCurrentUser()` from `lib/auth.ts`.
- Produces: `buildDailyReportSnapshot({ from, to, closedAt }: { from: Date; to: Date; closedAt: Date }): Promise<DailyReportSnapshot>` from `lib/reports.ts`. `DailyReportSnapshot` contains `summary` (approaches, interests, meetings, sales, revenue, MRR, completed follow-ups, channels, and member totals) and chronological `actions` (`id`, `type`, `leadId`, `leadName`, nullable `channel`, `occurredAt`, nullable `actorId`, nullable `actorName`, and nullable `note`). Action items include CRM activities, stage changes, sale events, and follow-up scheduled/completed/cancelled events in `[from, min(to, closedAt])`; lead/member names fall back safely when unavailable. Legacy wins without a `SaleEvent` use the same `Lead.wonAt` fallback as `buildReport`.
- Produces: `DailyReportRecord { id, dayStart, dayEnd, closedAt, closedById, snapshot: DailyReportSnapshot }`; `closeCurrentDailyReport(closedById: string, reference?: Date): Promise<{ report: DailyReportRecord; created: boolean }>`, `getDailyReportForDate(date: Date): Promise<DailyReportRecord | null>`, and `listRecentDailyReports(limit?: number): Promise<DailyReportRecord[]>` from `lib/daily-reports.ts`.
- Produces: authenticated `POST /api/reports` returning `{ report, created }`; weekly/monthly `GET /api/reports` behavior is unchanged. Repeated POST requests return the existing saved report with `created: false`.
- Persists: `DailyReport { id, dayStart, dayEnd, closedAt, closedById, snapshot }`, with unique `dayStart` and a JSON snapshot of the summary and action items. No cascading relation may erase the historical report if a lead/member is later deleted.

- [ ] **Step 1: Write the failing tests first.** Use namespace imports of the existing `lib/reports.ts` and `app/api/reports/route.ts` modules so the initial test run can assert that `buildDailyReportSnapshot` and `POST` are missing without a module-resolution failure. Then add DB-backed cases in `tests/unit/daily-reports.test.ts` named `requires authentication`, `snapshots daily events through the close instant`, `returns the original snapshot for a repeated close`, `does not absorb activity added after close`, and `lists zero-activity days with safe names`. Include an event at São Paulo local midnight (UTC date is the previous day), one at `closedAt`, and one after it. Delete `DailyReport` first in test setup.
- [ ] **Step 2: Run the focused tests and verify the first failures are explicit missing-export assertions; after implementation, the DB-backed cases must fail on behavioral mismatches.** Run `npx vitest run tests/unit/daily-reports.test.ts tests/unit/reports.test.ts`.
- [ ] **Step 3: Add the Prisma model and additive SQL migration.** Make the daily start timestamp unique; do not add foreign keys that could delete or rewrite the historical snapshot when a lead changes.
- [ ] **Step 4: Generate Prisma Client and apply the migration only to the isolated `atelier_test` schema.** Verify Prisma reports the new migration applied before exercising database tests.
- [ ] **Step 5: Implement `buildDailyReportSnapshot({ from, to, closedAt })` in `lib/reports.ts`.** Query each source event from `from` through `closedAt` (inclusive) but before `to`; derive metrics only from those event records, include follow-up scheduled/completed/cancelled timestamps only when they occurred by close, resolve names in batched lead/member lookups, and never include the current funnel as a daily metric. Keep `buildReport` unchanged.
- [ ] **Step 6: Implement the persistence helpers in `lib/daily-reports.ts`.** Use `getLocalDayWindow(reference)`, cap at `closedAt`, persist the immutable JSON snapshot once per `dayStart`, and re-read by the unique key after a duplicate/concurrent insert.
- [ ] **Step 7: Add authenticated `POST /api/reports` alongside the existing GET.** Reject unauthenticated requests, close only the current São Paulo day, return `{ report, created }`, and report database failures without a false success response.
- [ ] **Step 8: Run the focused tests, then `npm test` and `npm run typecheck`; confirm old report tests still pass and weekly/monthly calculations remain independent of `DailyReport`.**
- [ ] **Step 9: Commit and push this task as `feat: persist daily report snapshots`.**

### Task 2: Add close-day controls and daily report views

**Files:**
- Create: `components/daily-close-control.tsx`
- Modify: `app/(app)/page.tsx`
- Modify: `app/(app)/relatorios/page.tsx`
- Create: `tests/e2e/daily-close.spec.ts`

**Interfaces:**
- Consumes: the `POST /api/reports` response and the server-side daily report read helpers from Task 1.
- Produces: a reusable close control with idle/loading/closed/error states; a dashboard entry point; and a “Diário” view in Relatórios with snapshots selected by local date and a recent-closures list.
- Route state: `period=day` plus a `date=YYYY-MM-DD` São Paulo local-date query parameter selects a saved daily report; existing `period=week|month` behavior and links remain intact.

- [ ] **Step 1: Write failing Playwright cases first.** Add a desktop test that sees “Fechar o dia” on the dashboard and reports, closes once, sees “Dia fechado,” and opens the saved daily view; add a mobile test that checks the same control and daily archive at a narrow viewport. Use only the isolated E2E database.
- [ ] **Step 2: Run `npx playwright test tests/e2e/daily-close.spec.ts` and verify the initial failure is the missing feature, not test setup.**
- [ ] **Step 3: Implement the reusable client control.** POST to `/api/reports`, expose accessible idle/loading/closed/error states, refresh server-rendered close state on success, and link to the report without requiring a note.
- [ ] **Step 4: Add the control to the dashboard near its period controls and pass the current-day saved state from the server.** Keep the selected day/week/month metrics unchanged.
- [ ] **Step 5: Add the daily period and closed-report archive to `app/(app)/relatorios/page.tsx`.** Render the saved summary and chronological action timeline for `period=day&date=YYYY-MM-DD`; keep weekly/monthly pages backed by `buildReport` exactly as before and include unclosed-day activities.
- [ ] **Step 6: Run focused desktop/mobile E2E tests, then the full `npm run test:e2e`; verify no horizontal overflow and no regression in existing report, dashboard, navigation, and login journeys.**
- [ ] **Step 7: Run `npm run lint`, `npm run typecheck`, and `npm run build`; inspect the rendered dashboard and report page at desktop and mobile viewports.**
- [ ] **Step 8: Commit and push this task as `feat: add daily close controls and reports`.**

### Task 3: Apply the additive schema change and update the Cloudflare preview

**Files/targets:**
- Database: Supabase project schema `atelier` via the existing `DATABASE_URL` (production app schema only after all isolated tests pass).
- Runtime: the existing local Next.js production server on port `3004` and its active `trycloudflare.com` Quick Tunnel, if still available.

**Interfaces:**
- Consumes: verified source on `feat/atelier-approach-mvp`, successful production build, and migration already verified on `atelier_test`.
- Produces: production schema with the additive `DailyReport` table and an updated protected app preview through the same Quick Tunnel URL.

- [ ] **Step 1: Recheck that the known tunnel and port `3004` still belong to this project, and record the public preview URL without exposing environment secrets.** If the existing tunnel is gone, stop and report before creating a new public URL.
- [ ] **Step 2: Apply the already-tested additive migration to Supabase schema `atelier` using the existing production `DATABASE_URL`; verify only the expected `DailyReport` migration was applied.**
- [ ] **Step 3: Build the production app and replace the local server on port `3004` while keeping the current Cloudflare tunnel process and URL.**
- [ ] **Step 4: Smoke-test the public preview login page and verify unauthenticated app routes redirect to login; rely on isolated E2E for authenticated dashboard/daily-report behavior. Do not close a production day as a test.**
- [ ] **Step 5: Report the verified preview URL, commit IDs, test/build evidence, and that this is a temporary local preview, not permanent Cloudflare hosting.**

---
