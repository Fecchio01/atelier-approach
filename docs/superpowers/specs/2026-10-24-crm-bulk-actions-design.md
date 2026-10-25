# CRM bulk actions design

## Goal

Reduce repetitive work in the shared CRM action queue while preserving the existing per-task audit trail and concurrency protections.

## Scope

- In list view, select individual pending CRM tasks or all tasks currently visible under the active filters.
- Apply one operation to the selected tasks: complete, cancel, or assign to another team member.
- Limit a single operation to 100 tasks. Show the selected count and a confirmation step before canceling.
- Only manual `CrmTask` records are selectable. Automatic follow-ups remain individual and use their current workflow.
- Calendar and single-task controls continue to work as they do now.

## Safety and consistency

- The client submits each selected task's `updatedAt`; the server updates only tasks still pending at that exact version and reports skipped conflicts.
- Apply task changes and per-lead activity entries inside one database transaction.
- Use authenticated API routes and validate action, ids, version timestamps, and assignee.
- Clear selection after filter changes, a completed operation, or switching out of list view.
- Do not create, delete, or alter leads or automatic follow-up records.

## Out of scope

Bulk stage movement, bulk lead assignment, editing follow-up schedules, selection in calendar view, and operations over more than 100 tasks per request.
