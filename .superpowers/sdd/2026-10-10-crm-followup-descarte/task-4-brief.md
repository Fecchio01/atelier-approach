# Task 4 brief — lifecycle processor and protected cron route

## Scope

Implement `processLeadLifecycle(database, now)` in `lib/process-lead-lifecycle.ts`, the authenticated `GET /api/cron/crm-lifecycle` route, production schedule entry in `vercel.json`, and DB-free unit tests for processor and auth behavior. Export the minimal `LifecycleDatabase` interface and return `LifecycleProcessingResult` from `lib/lead-lifecycle.ts`.

## Processor contract

- Use one supplied `now` instant for deterministic due-date decisions; cron route supplies server time.
- Auto-follow-up applies only to active stages `CONTACTED`, `IN_CONVERSATION`, `QUALIFIED`, `PROPOSAL`, `MEETING` (plus normalized legacy equivalents if present). Do not auto-follow-up `WON`, `NO_RESPONSE`, `FOLLOW_UP`, or `DISCARDED`.
- For active leads whose `stageEnteredAt + followUpDelayDays <= now`, perform guarded transactional/conditional updates so a concurrent manual stage move wins. Create a single pending `FollowUp` due at the exact deadline, with `returnStage` equal to prior stage; assign the most recent CRM activity actor, falling back to the team owner label when no actor exists. Record system stage history and activity once.
- A recent `postFollowUpAt` within five elapsed days blocks automatic follow-up. At/after the five-day deadline, move eligible post-follow-up leads to `DISCARDED`, set `discardedAt` and stage-entry time, and write stage history/activity once. Guard stale writes and avoid processing `WON` or already `DISCARDED`.
- Permanently delete only `DISCARDED` leads whose non-null `discardedAt <= now - 7 days`; never infer a date for null legacy values.
- Repeated and concurrent invocations must be idempotent; one winning transition/activity per lead.
- Return only counts: `{ movedToFollowUp, discardedForInactivity, permanentlyDeleted }`.

## Cron route/config

- GET `/api/cron/crm-lifecycle` requires exact `Authorization: Bearer ${CRON_SECRET}` and returns 401/403 without a configured/matching secret.
- Do not expose lead PII or provide an unauthenticated client route.
- Add `* * * * *` to `vercel.json`; do not deploy or publish. Plan eligibility remains a pre-deployment verification.

## TDD and safety

- Add failing tests first for due transition, post-follow-up discard, retention boundary/null dates, stale/manual-stage conflict, repeated/concurrent calls, and missing/wrong cron secret.
- Run only DB-free focused tests. Do not invoke default Vitest global setup, Prisma migrate, or any database setup/changes.
- Preserve sale semantics and unrelated workspace files. Commit as `feat: automate CRM lifecycle deadlines`.
