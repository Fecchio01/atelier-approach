# Task 1 report: persist lifecycle timestamps and follow-up origin

## Changes

- Added `Lead.stageEnteredAt DateTime @default(now())`, `postFollowUpAt DateTime?`, and `discardedAt DateTime?` to the Prisma model. Added indexes for `(stage, stageEnteredAt)` and `discardedAt`.
- Added `FollowUp.returnStage LeadStage?`.
- Added migration `20261010000000_crm_followup_discard_lifecycle`. Adding `stageEnteredAt` with `DEFAULT CURRENT_TIMESTAMP` initializes existing leads at migration time and provides the default for new leads. The nullable `discardedAt` receives the minimum `StageHistory.createdAt` for a `DISCARDED` transition; the `WHERE EXISTS` clause leaves it `NULL` when no such history exists. Other than that required backfill, the migration only adds columns and indexes.
- Added focused contract tests for the Prisma fields, additive schema changes, earliest discard history, and null when no reliable discard history is present.

## RED evidence

Command:

```text
npm test -- tests/unit/lead-lifecycle-migration.test.ts
```

Output before implementation:

```text
❯ tests/unit/lead-lifecycle-migration.test.ts (3 tests | 3 failed)
  × exposes lifecycle timestamps and follow-up return stage in the Prisma contract
  × adds the fields and indexes without rewriting existing CRM records
  × backfills the earliest recorded discard transition and leaves missing history null
Test Files  1 failed (1)
Tests  3 failed (3)
```

The assertions failed because the lifecycle fields and migration were absent. The required RED-phase typecheck was also run:

```text
npm run typecheck

> atelier-approach@0.1.0 typecheck
> tsc --noEmit --incremental false
```

It exited successfully; there were no existing TypeScript consumers that made the missing Prisma fields fail typechecking.

## GREEN and schema checks

Commands:

```text
npx prisma validate
npx prisma generate
npm test -- tests/unit/lead-lifecycle-migration.test.ts
npm run typecheck
```

Results:

```text
The schema at prisma\schema.prisma is valid 🚀
✔ Generated Prisma Client (v6.16.1) to .\node_modules\@prisma\client in 91ms
Test Files  1 passed (1)
Tests  3 passed (3)
tsc --noEmit --incremental false  # exited 0
```

The focused test was repeated after the full suite and passed again: `Test Files 1 passed (1); Tests 3 passed (3)`.

## Full unit suite and migration deployment

The full unit suite was run with `npm test`. Database-backed tests fail because the isolated database does not yet have the new `Lead.stageEnteredAt` column. Representative exact error:

```text
The column `stageEnteredAt` does not exist in the current database.
```

The deployment URL was sourced only from `TEST_DATABASE_URL`, and the command checked that its `schema` query parameter was exactly `atelier_test` before assigning it to `DATABASE_URL`. Prisma confirmed the target before applying migrations:

```text
Datasource "db": PostgreSQL database "postgres", schema "atelier_test" at "aws-0-sa-east-1.pooler.supabase.com:5432"
10 migrations found in prisma/migrations
Applying migration `20261007000000_metric_result_imports`
Error: P3018
Migration name: 20261007000000_metric_result_imports
Database error code: 42P07
ERROR: relation "MetricImportBatch" already exists
```

Deployment stopped at the existing `20261007000000_metric_result_imports` migration, before this task's migration was reached. No migration history repair or database changes were attempted after this failure.

## Commit

The task files and this report are committed together after scoped review.
