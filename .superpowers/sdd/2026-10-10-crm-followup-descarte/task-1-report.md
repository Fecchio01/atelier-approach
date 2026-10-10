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

## Initial full unit suite and migration deployment attempt

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

## Round 1 review follow-up

The initial deployment blocker above was subsequently resolved by the controller in the isolated `atelier_test` schema. Per controller-provided verification: the partially applied `20261007000000_metric_result_imports` migration was completed without deleting rows, its migration record was resolved, the lifecycle SQL was applied through the Supabase admin connection because `atelier_app` cannot own or alter `Lead` and `FollowUp`, and Prisma now reports migration status up to date. No further database changes were made during this review-fix task.

The applied lifecycle migration is additive: it adds columns and indexes and runs an `UPDATE` only for the required discard timestamp backfill; it has no `DELETE` or `DROP` statements.

Read-only migration status command, with `DATABASE_URL` sourced only from a `TEST_DATABASE_URL` whose `schema` parameter was checked to equal `atelier_test`:

```text
npx prisma migrate status

Datasource "db": PostgreSQL database "postgres", schema "atelier_test" at "aws-0-sa-east-1.pooler.supabase.com:5432"
10 migrations found in prisma/migrations
Database schema is up to date!
```

Read-only data check used the same schema-guarded URL. It checked `current_schema()`, row counts, null `stageEnteredAt` values, and whether each lead with a `DISCARDED` history transition had `discardedAt` equal to the minimum transition timestamp. Exact output:

```json
{"scope":[{"schema":"atelier_test","leads":0,"followups":0,"activities":0,"stage_history":0}],"leadFields":[{"leads":0,"missing_stage_entered":0,"null_discarded":0}],"history":[{"discarded_history_leads":0,"timestamp_mismatches":0}]}
```

The isolated schema currently contains no lead or history rows, so this read-only query could not independently compare legacy timestamp values or before/after CRM record counts. The migration status is verified as up to date; the controller-provided statement above is the evidence that the pre-existing migration repair preserved rows when it was completed.

### Rollback-only lifecycle migration behavior check (controller-run)

To exercise legacy data without persisting fixtures, the controller ran the exact lifecycle migration/backfill SQL inside a rollback-only transaction against temporary shadow tables for `Lead`, `FollowUp`, and `StageHistory` in isolated `atelier_test`. The transaction ended with `ROLLBACK`. The controller reported this exact result:

```json
[{"preserved_lead_fixtures":3,"initialized_stage_timestamps":3,"backfilled_discard_timestamps":1,"null_history_preserved":1}]
```

This verifies the backfill and preservation behavior against three temporary lead fixtures, including one lead with a discard transition and one without trustworthy discard history. It was run by the controller, not by this task agent; it did not persist fixtures or make database changes. The actual `atelier_test` schema remains empty of historical CRM rows, so production-row timestamp values remain unobservable there.

After documenting this controller-run check, the focused test was rerun with the no-global-setup config (removed after use):

```text
npx vitest run --config vitest.lifecycle.config.ts
✓ tests/unit/lead-lifecycle-migration.test.ts (3 tests) 3ms
Test Files  1 passed (1)
Tests  3 passed (3)

npm run typecheck
> tsc --noEmit --incremental false
# exited 0
```

The lifecycle contract test was strengthened in this round. Schema text assertions now inspect only the `Lead` and `FollowUp` model blocks, including the two `Lead` indexes. Compile-time assertions against generated Prisma `Lead` and `FollowUp` types require the exact four field types and nullability.

Because the normal Vitest config runs a global setup that deletes rows from the test database, the focused test was executed with a temporary config that omitted global setup; that config was removed afterward. No test command in this round wrote to `atelier_test`.

Commands and results:

```text
npx vitest run --config vitest.lifecycle.config.ts

✓ tests/unit/lead-lifecycle-migration.test.ts (3 tests) 4ms
Test Files  1 passed (1)
Tests  3 passed (3)

npm run typecheck

> tsc --noEmit --incremental false
# exited 0

npx prisma validate
The schema at prisma\schema.prisma is valid 🚀
```
