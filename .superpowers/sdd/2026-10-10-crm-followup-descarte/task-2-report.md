# Task 2 report: deterministic lifecycle rules

## Implementation

- Added pure lifecycle date helpers in `lib/lead-lifecycle.ts` using UTC epoch milliseconds and integer-day arithmetic.
- Follow-up delay must be a positive integer; invalid dates and calculated dates outside JavaScript's valid `Date` range raise `RangeError`.
- The post-follow-up discard deadline is exactly five elapsed days after `completedAt`. The seven-day purge threshold is inclusive; null legacy discard timestamps are never purge-eligible.
- Warnings begin at exactly 24 hours before the discard deadline, include the deadline instant, and continue for overdue records until processing removes/changes them. `daysRemaining` uses `Math.ceil`, so the final 24-hour window reports `1`, deadline reports `0`, and overdue full days are negative.
- Added `LifecycleProcessingResult` with the three specified numeric counters.

The helper layer has no operation that creates a follow-up or tracks repeat scheduling. The “no repeat follow-up during the post-follow-up five-day timer” test therefore covers the rule this pure API owns: the five-day timer starts from completion time and is independent of the previous follow-up's due time. Follow-up side-effect behavior belongs to later processor/API tasks.

## RED

The normal Vitest config runs `tests/setup-test-database.ts`, which deletes rows in `atelier_test`. Because this task was explicitly required not to touch any database, a temporary config limited to the focused test and without `globalSetup` was used for both RED and GREEN; the temporary config was removed afterward.

Command:

```text
npm test -- --config vitest.lifecycle.config.ts
```

Before adding the helper, Vitest failed for the expected missing-module reason:

```text
FAIL tests/unit/lead-lifecycle.test.ts
Error: Cannot find module '../../lib/lead-lifecycle'
Test Files  1 failed (1)
Tests  no tests
```

## GREEN

The same focused command passed after implementation:

```text
✓ tests/unit/lead-lifecycle.test.ts (9 tests) 4ms
Test Files  1 passed (1)
Tests  9 passed (9)
```

Typecheck:

```text
npm run typecheck

> tsc --noEmit --incremental false
# exited 0
```

No database commands were run and no database was changed.
