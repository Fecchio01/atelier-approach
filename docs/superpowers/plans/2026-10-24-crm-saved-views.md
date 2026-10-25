# CRM saved views implementation plan

> **For agentic workers:** follow `superpowers:executing-plans` task by task. Keep implementation within the approved design and preserve unrelated worktree changes.

**Goal:** Add per-member CRM saved filter views and one-click presets for common funnel and action queues.

**Architecture:** Store allowlisted filter snapshots in a new `CrmSavedView` Prisma model. Authenticated APIs scope every operation to the current member. A reusable client control loads presets and saved views, applies filter snapshots to existing funnel/action state, and supports save, rename, and delete.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, PostgreSQL on Supabase, existing CRM filters.

## Global Constraints

- Keep the saved-view scope personal to the authenticated member; never change CRM lead, task, or follow-up records.
- Validate and allowlist every filter field on the server; enforce owner scoping on every API operation.
- Enable RLS and grant table access only to the existing `atelier_app` role, matching this app's server-side authorization model.
- Preserve all current controls, calendar day behavior, polling, and data access patterns.
- Stage only files for this feature; preserve all pre-existing modified and untracked worktree files.
- Do not add or run tests unless requested. Typecheck, lint, and production deployment verification are release checks.
- Commit and push to GitHub, fast-forwarding `main` only if it remains safe; deploy the committed revision to Vercel production and verify READY.

## Review Focus

- “Propostas sem retorno” means `PROPOSAL` plus no scheduled next action.
- Saved views sync across devices for one member but cannot be read or changed by another member through the API.
- Applying an action view restores assignment, period, and display mode without restoring a calendar day.
- Duplicate/case-folded names and invalid/tampered filter JSON are rejected safely.

## Tasks

### Task 1 — Add typed saved-view filter parsing and persistence

**Files:**
- Modify `prisma/schema.prisma`
- Create a Prisma migration in `prisma/migrations/`
- Create `lib/crm-saved-views.ts`
- Create authenticated `/api/crm/saved-views` and `/api/crm/saved-views/[id]` routes

**Implementation:**
- Add the owner relation, scope enum, JSON filters, normalized name, unique key, and lookup index.
- Parse funnel/action filters through a strict allowlist; normalize names and cap each member at 20 saved views per scope.
- Implement GET/POST and owner-scoped PATCH/DELETE; map duplicate names and missing rows to useful 409/404 responses.
- Enable RLS, add the existing `atelier_app` policy and grants, then apply the matching DDL migration to the Atelier Approach Supabase project.

**Verification:** inspect the new table, RLS policy, indexes, and migration history with read-only Supabase queries after applying the migration.

### Task 2 — Add saved-view controls and built-in presets

**Files:**
- Create `components/crm-saved-views.tsx`
- Modify `components/kanban-board.tsx`
- Modify `components/crm-action-queue.tsx`
- Modify `lib/crm-board-view.ts`

**Implementation:**
- Add a reusable accessible bar for presets and custom views with save, rename, apply, and delete actions.
- Funnel presets restore the search/filter/sort controls; add the proposal-without-next-action filter.
- Action presets restore assignment, period, and list/calendar mode.
- Keep the current manual controls usable and compute selected state from the current filters.

**Verification:** inspect both scope integrations, ensure each preset applies to the same filters used by the existing list/calendar, and ensure failures stay visible without disabling the CRM.

### Task 3 — Review, commit, push, and production deploy

**Implementation:**
- Run lint and typecheck; review only staged feature changes.
- Commit the coherent feature, push it, and fast-forward `main` only if there is no divergence.
- Deploy the committed revision to the linked Vercel production project; inspect the deployment until it is `READY`.

**Verification:** report commit, pushed branches, Supabase migration/table verification, Vercel status, and the production URL.
