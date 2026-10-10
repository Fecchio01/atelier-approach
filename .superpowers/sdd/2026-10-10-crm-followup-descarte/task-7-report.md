# Task 7 report — isolated lifecycle E2E (not complete)

## Test/config prepared

- Added `playwright.crm-lifecycle.config.ts`, which validates that `TEST_DATABASE_URL` has `schema=atelier_test`, explicitly sets the app `DATABASE_URL` to that URL, sets a test-only cron secret, uses a dedicated `NEXT_DIST_DIR`, and disables global setup.
- Added `tests/e2e/crm-lifecycle-automation.spec.ts`. It uses unique fixture IDs, a cron-candidate preflight before each cron request, checks that the trash contains only its own discarded fixture before invoking the global empty-trash endpoint, and deletes only its exact fixture lead IDs in `finally`.
- Safety assumption/caveat: the preflight is a read-check-call guard, not an atomic lock. It assumes the dedicated `atelier_test` schema has no concurrent independent writers while this serial (`workers: 1`) config runs. A concurrent writer could create a cron candidate or discarded lead between the check and the global processor/empty-trash request; this E2E does not broaden product endpoints solely for test scoping.
- Planned coverage: protected cron, due move to FOLLOW_UP and origin display, UI completion/restoration, warning and five-day discard, seven-day purge, and confirmed manual empty-trash.

## Verification and blocker

Config/test discovery succeeded:

```text
npx playwright test --config playwright.crm-lifecycle.config.ts --list

Listing tests:
  crm-lifecycle-automation.spec.ts:65:5 › runs a complete CRM lead lifecycle with only scoped atelier_test fixtures
Total: 1 test in 1 file
```

The first E2E attempt did not reach the test body:

```text
npx playwright test --config playwright.crm-lifecycle.config.ts --reporter=line

Error: Timed out waiting 60000ms from config.webServer.
```

The dedicated config was changed to use a 180-second readiness timeout and `/login`. The app process listened on port 3017, but `/login` did not return during the attempt. A manual launch using the same dedicated `.next-e2e-crm-lifecycle` directory reported:

```text
✓ Starting...
✓ Ready in 1814ms
○ Compiling /middleware ...
✓ Compiled /middleware in 681ms (225 modules)
○ Compiling /login ...
```

A direct `/login` probe timed out after five seconds. Playwright's second attempt was stopped before its 180-second readiness timeout; no E2E fixture code ran. The web server process started by that attempt and the manual diagnostic server were stopped. No database connection, setup, or fixture mutations occurred.

Type check:

```text
npm run typecheck
> tsc --noEmit --incremental false
```

It exited 0. Generated `next-env.d.ts`/`tsconfig.json` changes were restored to their pre-run state. The generated `.next-e2e-crm-lifecycle` directory was preserved.

Task 7 is prepared but remains unverified: the E2E did not execute because of the `/login` compilation/readiness issue. Its test artifacts are committed for review, not marked complete. No global cleanup, production access, migration, or deployment was performed.
