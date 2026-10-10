# Task 6 brief — dashboard pre-discard warnings

Add an informational dashboard panel for leads whose five-day post-follow-up deadline is within the final 24 hours or already overdue but not yet processed. Query at most 10 matching active leads, ordered by earliest discard deadline, and select only the fields needed for the panel (including the persisted follow-up origin). Display lead name, current stage, origin stage, discard deadline, and remaining/overdue time. Link each item to `/crm?lead=<id>` so the CRM opens that lead's detail. Keep empty state quiet and informational; warnings never request approval. Preserve existing dashboard behavior/performance. Use DB-free focused tests; do not run the specified E2E because its database isolation/setup is not established in this task context.

## TDD contract

- Test final-24-hour and overdue warning projection, terminal/advanced/no-deadline exclusions, earliest-deadline ordering and max 10 query cap.
- Test rendered lead, current stage, origin, deadline, remaining time, CRM detail href, informational copy, and empty state.
- Do not invoke global database setup, database mutations, deployment, or production access.
- Commit as `feat: warn about leads nearing automatic discard`.
