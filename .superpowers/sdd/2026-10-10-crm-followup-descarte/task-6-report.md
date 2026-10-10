# Task 6 report — dashboard lifecycle warnings

## Implementation

- Added a concurrent, server-side dashboard query for active leads with `postFollowUpAt <= now - 4 days`, ordered by the earliest deadline and capped at 10. The query selects only the lead identity/name/stage/timestamp and one latest completed follow-up origin; it does not load activity history.
- Reuses `getLeadLifecycleWarning` to include final-24-hour and overdue-but-unprocessed leads, while excluding terminal stages and leads with no active deadline.
- Added an informational dashboard panel showing lead, current stage, origin (or “não registrada”), discard deadline, and remaining/overdue time. Each row links to `/crm?lead=<id>`.
- Added populated/overdue projection, bounded query, no-deadline exclusion, informational copy, detail href, and empty-state coverage. Added an E2E empty-state assertion to the existing dashboard spec.

## TDD and verification

RED: before adding the query/component, ran:

```text
npm test -- --config vitest.dashboard-lifecycle.config.ts
```

It failed as expected with `Cannot find module '@/lib/dashboard-lifecycle-warnings'` from `tests/unit/dashboard-lifecycle-warnings.test.tsx`.

GREEN focused DB-free run:

```text
npm test -- --config vitest.dashboard-lifecycle.config.ts

✓ tests/unit/dashboard-lifecycle-warnings.test.tsx (4 tests) 28ms

Test Files  1 passed (1)
     Tests  4 passed (4)
```

`npm run typecheck` exited 0 (`tsc --noEmit --incremental false`). `git diff --check` exited 0; Git emitted only line-ending normalization warnings for modified files.

E2E was not run: `playwright.config.ts` invokes `tests/setup-test-database.ts`, which deletes `MetricImportBatch`, `DailyReport`, `Lead`, `Goal`, and `MemberProfile` rows. This task prohibits destructive DB setup. The E2E empty-state assertion is committed but remains unexecuted; the populated warning/detail link is verified by the DB-free unit test.

No database commands, deployment, or production access were used.
