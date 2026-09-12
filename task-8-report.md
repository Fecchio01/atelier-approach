# Task 8 report — robustness, accessibility, and acceptance

## Delivered

- Added acceptance coverage for an unavailable OSM search, duplicate CRM handling, and the dashboard at a 375px viewport.
- Announces search and save errors with `role="alert"`, exposes search busy state, and adds a consistent keyboard focus outline.
- Preserves the duplicate redirect while showing an explicit CRM notice: “Esta empresa já está no CRM.”
- Added empty/error-safe user messages, mobile acceptance coverage, and setup/OSM operating guidance in `README.md`.
- Added `npm run lint` using a non-incremental TypeScript check.
- Removed shared SQLite test races by running Vitest files serially and made Playwright deterministic: one browser worker, a unique OSM business per CRM test, and lead-scoped assertions.

## Verification evidence

- `npm run lint` — passed.
- `npx vitest run` — 8 files / 24 tests passed.
- `npx playwright test --retries=0 --reporter=list` — 7 tests passed.
- `npm run build` — passed; all 11 application routes generated successfully.

## Review

The final diff was checked with `git diff --check`. Generated local SQLite and TypeScript build artifacts are intentionally excluded from the commit.

## Review round 1

- Added a second configured internal-account path (`AUTH_INTERNAL_SECONDARY_EMAIL` and `AUTH_INTERNAL_SECONDARY_PASSWORD`) with a distinct member identity; both members use the existing login form and share the CRM.
- Added CRM controls to schedule a date/time follow-up and to close a deal with required sale value and MRR. A successful CRM mutation navigates back to the CRM route so the server-rendered board immediately reflects the saved state.
- Expanded acceptance coverage for a real overdue follow-up on the dashboard, a second member seeing the same record, revenue/MRR changing after closure, missing OSM contacts, successful-empty search guidance, failed-search state separation, and mobile horizontal overflow.
- Replaced the former typecheck-only `lint` alias with ESLint plus the Next plugin; retained `npm run typecheck` as a separate command.
- Added radius/term guidance only for a successful empty search; an OSM failure now remains an alert without also showing an empty-state result.

### Verification evidence

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npx vitest run` — 8 files / 26 tests passed.
- `npx playwright test --retries=0 --reporter=list` — 10 tests passed.
- `npm run build` — passed; all 11 application routes generated successfully.
