# Task 3 report — user-driven lifecycle transitions

## Implementation

Implemented follow-up origin-stage persistence and atomic completion behavior in the lead route. Completion restores the recorded stage, writes `stageEnteredAt` and `postFollowUpAt` at the same instant, records history/activity, and conflicts on duplicate completion. Legacy follow-ups without an origin preserve the current stage while starting the timer. Manual transitions reset lifecycle timestamps, and the route rejects a new transition into `FOLLOW_UP` during the five-day post-completion window before writing a follow-up or audit activity. Existing sale reversal/financial behavior was kept intact.

The explicit cooldown guard covers the user-driven route only; Task 4 must apply the same repeat-follow-up exclusion to the processor path.

## TDD evidence

RED was run before implementation with the temporary isolated config:

```text
npm test -- --config vitest.lifecycle.config.ts
```

Relevant output:

```text
tests/unit/lead-routes.test.ts (46 tests | 7 failed | 27 skipped)
```

The seven failures identified missing lifecycle timestamps, discard time, origin-stage restoration, cooldown conflict/no-write behavior, and completion history behavior. Existing selected sale-financial contract tests passed.

GREEN after implementation (including the fake transaction/concurrency coverage):

```text
npm test -- --config vitest.lifecycle.config.ts
```

```text
✓ tests/unit/lead-sale-concurrency.test.ts (4 tests | 3 skipped) 9ms
✓ tests/unit/lead-routes.test.ts (46 tests | 27 skipped) 23ms

Test Files  2 passed (2)
Tests  20 passed | 30 skipped (50)
```

The focused config selected tests marked `without database`; PostgreSQL concurrency tests and global database setup were intentionally not run. The fake concurrency case verified that concurrent completion requests yield one success and one conflict, with one completion activity. The route tests verify that a second follow-up request during `postFollowUpAt` plus five days returns 409 with no writes.

Typecheck after the final test changes:

```text
npm run typecheck
> atelier-approach@0.1.0 typecheck
> tsc --noEmit --incremental false
```

Exit status: 0. `git diff --check` also completed with no whitespace errors.

## Scope and environment

No database commands or production changes were made. The temporary `vitest.lifecycle.config.ts` used to isolate DB-free tests was removed after verification. Existing unrelated `.next-*` directories, plan files, and the preexisting Task 1 report modification were left untouched.
