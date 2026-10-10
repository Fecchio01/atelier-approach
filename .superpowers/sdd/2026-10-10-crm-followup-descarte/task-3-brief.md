### Task 3: Preserve and reset lifecycle state in user-driven CRM transitions

**Files:** Modify `app/api/leads/[id]/route.ts` and `lib/lead-lifecycle.ts`; test `tests/unit/lead-routes.test.ts` and retain sale-concurrency coverage in `tests/unit/lead-sale-concurrency.test.ts`.

Record the source stage when a new follow-up is created. Completion must atomically complete the follow-up, restore its source stage when present, set `stageEnteredAt` and `postFollowUpAt` to the completion instant, and write stage history/activity. For a legacy follow-up with no `returnStage`, preserve its current lead stage while completing and starting the timer. A duplicate completion returns conflict and adds no activity.

Manual stage changes reset `stageEnteredAt` and clear `postFollowUpAt`; entering `DISCARDED` sets `discardedAt`, and leaving it clears that timestamp. Preserve existing sale reversal and financial behavior. During the five elapsed days after `postFollowUpAt`, reject a new transition into `FOLLOW_UP` with HTTP 409 and create no follow-up or audit activity. This guards repeat scheduling during the post-completion timer; Task 4 must also guard the processor path.

Use fake transaction/unit tests for the lifecycle routes. Do not run the shared Vitest `globalSetup` or touch a database. RED first, then implement, rerun focused tests and typecheck, and commit as `feat: restore lead stage after follow-up`.
