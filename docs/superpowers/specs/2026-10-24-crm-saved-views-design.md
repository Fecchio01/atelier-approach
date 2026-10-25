# CRM saved views design

## Goal

Let each CRM member save reusable filter combinations and see them on every device. Built-in views make common work queues one click away.

## Scope

- Funnel preset: **Propostas sem retorno** means a lead is in `PROPOSAL` and has no scheduled next action.
- Actions presets: **Minhas ações** and **Atrasadas**. Existing assignment, period, and list/calendar controls remain available and editable.
- Members can save the current filter combination, rename a saved view, apply it, and delete it.
- Saved views belong to the signed-in member and sync across devices. They store only filter settings, never lead, task, or follow-up data.

## Saved filter data

- Funnel: search query, board filter, and sort order.
- Actions: assignment filter, due-date period, and list/calendar mode. Calendar selected day is not saved.
- API accepts only the enumerated fields and valid enum values; names are trimmed, limited to 40 characters, and unique per member/scope after case folding. Limit: 20 custom views per scope.

## Persistence and access

Add `CrmSavedView` under the existing `atelier` PostgreSQL schema with JSON filter state, a `MemberProfile` owner relation, uniqueness/indexes, and RLS enabled. The application API always scopes reads, updates, and deletes by the authenticated member id. Match the existing `atelier_app` database policy; do not expose the table to browser roles.

## UX behavior

- Presets and custom views appear as compact, accessible chips in their relevant CRM view.
- Selecting a view updates the visible controls and switches to the corresponding CRM tab.
- Current selections remain editable. The selected-chip state clears naturally when the current filters no longer match that saved view.
- Saving and renaming use inline forms; deleting asks for confirmation. API errors are shown beside the controls.

## Out of scope

Shared/team-wide views, arbitrary filter builders, automation rules, bulk operations, pinned/default views, and calendar-day persistence.
