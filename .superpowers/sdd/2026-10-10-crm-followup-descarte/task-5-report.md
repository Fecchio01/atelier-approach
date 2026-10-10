# Task 5 report — follow-up origin and empty trash

## Implementation

- Added lifecycle timestamps and latest pending follow-up `returnStage` to the board query/projection, exposed as `followUpOriginStage`.
- Added localized `Veio de …` origin labels to follow-up cards and the lead detail header only when trustworthy origin data exists.
- Added an empty-trash control only when discarded leads exist, with an explicit irreversible-deletion confirmation and busy/error/success handling.
- Added authenticated `DELETE /api/leads/trash`; the request body cannot select records, and deletion is constrained to `stage: 'DISCARDED'`.
- Kept the new route/UI/query tests in a dedicated DB-free test file/config. The existing `tests/unit/lead-routes.test.ts` has database-writing setup, so it was not run or extended for this isolated test.

## TDD and verification evidence

RED: before implementing the query projection/route, ran `npm test -- --config vitest.lifecycle.config.ts`. The new contract tests failed because the selected board projection had no `followUpOriginStage` and the `/api/leads/trash/route` module did not yet exist.

GREEN: after implementation and final cleanup:

```text
> atelier-approach@0.1.0 test
> vitest run --config vitest.lifecycle.config.ts

✓ tests/unit/crm-board-query.test.ts (2 tests) 4ms
✓ tests/unit/commercial-modal.test.tsx (5 tests) 25ms
✓ tests/unit/lead-lifecycle-ui.test.tsx (4 tests) 30ms

Test Files  3 passed (3)
     Tests  11 passed (11)
```

Type check command: `npm run typecheck`

```text
> atelier-approach@0.1.0 typecheck
> tsc --noEmit --incremental false
```

It exited 0. `git diff --check` also exited 0; Git emitted only line-ending normalization warnings for modified files.

No database commands, deployment, or production access were used.
