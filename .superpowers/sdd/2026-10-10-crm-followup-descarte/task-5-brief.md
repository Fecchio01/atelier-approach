# Task 5 brief — follow-up origin and confirmed empty trash

## Scope

Expose `followUpOriginStage` and lifecycle timestamps in the CRM board projection; show localized “Veio de …” origin in follow-up cards and lead details without inventing an origin for legacy rows; show an “Esvaziar lixeira” action only if discarded leads exist; require explicit confirmation before calling an authenticated `DELETE /api/leads/trash` endpoint that filters only current `DISCARDED` leads and returns `{ deletedCount }`.

## TDD contract

- Board query selects only needed lead fields, lifecycle timestamps, latest activity, and the latest pending follow-up's `returnStage` (not full activity/follow-up history).
- The board card and detail render the localized origin label only when origin data exists.
- Empty-trash control is absent when no discarded leads exist. Confirmation clearly states permanent deletion and that it cannot be undone; preserve other card actions and existing sale behavior.
- DELETE route authenticates via `getCurrentUser`, uses `prisma.lead.deleteMany({ where: { stage: 'DISCARDED' } })`, and returns `{ deletedCount: count }`. Active rows must never be included by request data.
- Tests are DB-free and must not load Vitest's database global setup.
- Commit as `feat: expose follow-up origin and empty trash`.
