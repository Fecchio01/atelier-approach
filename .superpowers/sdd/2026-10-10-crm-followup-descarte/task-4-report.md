# Task 4 report — lifecycle processor and protected cron

## Implementation

Added `processLeadLifecycle(database, now)` and a minimal `LifecycleDatabase` interface. The processor uses a supplied server instant, shared configured follow-up delay (defaulting through the existing settings helper), UTC millisecond boundaries, and guarded `updateMany` predicates over lead ID, stage, stage-entry timestamp, and post-follow-up timestamp. It performs transition writes and audit records in per-lead transactions only after a conditional update succeeds, so a previously committed manual stage move or another processor run cannot create a stale follow-up/discard transition.

When a due lead enters `FOLLOW_UP`, the processor cancels stale pending follow-ups, creates one new follow-up due at the original deadline with the exact source stage, assigns its owner from the latest CRM activity (or `__team__` fallback), and writes a system-authored history/activity entry. It excludes `WON`, `NO_RESPONSE`, `FOLLOW_UP`, and `DISCARDED` from automatic follow-up. A completed follow-up's active five-day timer prevents repeat scheduling; at the exact deadline the eligible active source stage is discarded, its pending follow-ups are cancelled, and `discardedAt` is set. Purging requires current `DISCARDED` stage and a non-null `discardedAt` no later than the seven-day cutoff; legacy null dates are preserved.

Added the bearer-secret protected `GET /api/cron/crm-lifecycle`, returning processing counts only, and the `* * * * *` Vercel cron entry. No deployment or database commands were run. Vercel plan eligibility remains to be verified before enabling/publishing.

## TDD evidence

Tests were written first for processor/route contracts. Focused tests use a temporary Vitest config with no global setup and no database access.

RED command:

```text
npm test -- --config vitest.lifecycle.config.ts
```

The initial run failed because the processor and cron route modules did not yet exist:

```text
Failed Suites 2
tests/unit/crm-lifecycle-cron.test.ts: Cannot find module '../../app/api/cron/crm-lifecycle/route'
tests/unit/lead-lifecycle-processor.test.ts: Cannot find module '../../lib/process-lead-lifecycle'
Test Files  2 failed (2)
Tests  no tests
```

An intermediate implementation run caught a cooldown boundary error: a one-day-old `postFollowUpAt` was incorrectly treated as due for discard. The cutoff was corrected to the exact five elapsed days before the final GREEN run.

GREEN command:

```text
npm test -- --config vitest.lifecycle.config.ts
```

```text
✓ tests/unit/crm-lifecycle-cron.test.ts (3 tests) 8ms
✓ tests/unit/lead-lifecycle-processor.test.ts (7 tests) 8ms

Test Files  2 passed (2)
Tests  10 passed (10)
```

Typecheck:

```text
npm run typecheck
> atelier-approach@0.1.0 typecheck
> tsc --noEmit --incremental false
```

Exit status: 0. `git diff --check` was clean. The temporary `vitest.lifecycle.config.ts` was removed after verification. Database setup, migrations, deployments, and production systems were not touched.

## Coverage notes

The DB-free tests cover due follow-up with exact due time/origin/latest actor, team-owner fallback, excluded stages, stale pending follow-up cancellation, five-day discard boundary, seven-day purge boundary, null/young retention preservation, a manual-move compare-and-set race, concurrent/repeated invocation idempotency, active cooldown, missing/incorrect cron credentials, and count-only authorized output.

## Review fix round

Added a pure `isCronAuthExemptPath` path predicate used by middleware. It exempts only the exact `/api/cron/crm-lifecycle` path; the cron route still enforces its bearer `CRON_SECRET`. Other API paths, trailing slashes, and descendants remain subject to normal Auth.js middleware. Split post-follow-up expiry eligibility from follow-up scheduling eligibility: five-day expiry now also processes `FOLLOW_UP` (including legacy completions that preserve that stage) and `NO_RESPONSE`, while the two-day follow-up selector still excludes both and excludes `WON`/`DISCARDED`.

### RED

Added a processor regression for legacy `FOLLOW_UP` and `NO_RESPONSE` timers plus exact-path middleware predicate assertions, then ran:

```text
npm test -- --config vitest.lifecycle.config.ts
```

The processor regression expected 2 discards but got 0; the cron test suite also could not resolve the not-yet-created path predicate module. Both exposed the missing behavior.

### GREEN

After implementing the exact-path bypass and separate expiry stage set, the focused DB-free run passed:

```text
npm test -- --config vitest.lifecycle.config.ts
```

```text
✓ tests/unit/crm-lifecycle-cron.test.ts (4 tests) 9ms
✓ tests/unit/lead-lifecycle-processor.test.ts (8 tests) 9ms

Test Files  2 passed (2)
Tests  12 passed (12)
```

```text
npm run typecheck
> atelier-approach@0.1.0 typecheck
> tsc --noEmit --incremental false
```

Typecheck exited 0 and `git diff --check` was clean. Tests continued to use the temporary config with no global setup; no DB access or deployment occurred.
