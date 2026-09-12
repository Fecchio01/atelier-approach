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
