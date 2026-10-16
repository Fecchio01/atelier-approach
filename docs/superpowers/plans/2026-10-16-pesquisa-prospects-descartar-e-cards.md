# Pesquisa de prospects: descarte e cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make company research dismissals persistent per user, restore trustworthy source contacts, validate Instagram links, and render consistent prospect cards with verified photos when available.

**Architecture:** Add a user-scoped Prisma dismissal record and authenticated idempotent endpoint, then filter dismissed Overture IDs from both initial and paginated searches. Keep contact normalization and display-name cleanup in testable helpers; keep card actions and fixed-height layout in `LeadCard` and the research page.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Vitest, Playwright, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-10-16-pesquisa-prospects-descartar-e-cards-design.md`

## Global Constraints

- Discards are scoped to the authenticated owner and persist between searches; they do not create or delete CRM Leads.
- Keep Overture as the business source; do not add a phone API or mix prospect sources.
- Never convert an ordinary phone number into a WhatsApp link.
- A WhatsApp action requires an explicit WhatsApp URL from Overture or the same number verified on the confirmed official business site.
- Only use a real photo when it comes from a matching official business page; retain the branded visual fallback otherwise.
- Show the company name, not a long promotional description; keep card actions aligned and links contained.
- Preserve unrelated working-tree changes and commit only explicitly named task files.

## Review Focus

- A prospect has a source phone but no website: retain it as a phone and do not generate WhatsApp; test in Task 1.
- A company website belongs to a different business or conflicts with its sourced phone: do not import its contacts or image; test in Task 1.
- Instagram is a post URL, a deceptive host, a non-HTTPS URL, or a bare handle: only a valid Instagram profile becomes an action; test in Task 2.
- A dismissal request is unauthenticated, malformed, repeated, or submitted by another user: enforce owner scope and idempotence; test in Task 3.
- A dismissal happens while a progressive search has queued later pages: exclude it on the next page as well as on new searches; test in Task 4.

---

### Task 1: Preserve Overture contacts without weakening verification

**Files:**
- Modify: `lib/prospect-enrichment.ts`
- Test: `tests/unit/prospect-enrichment.test.ts`

**Interfaces:**
- Consumes and produces `ExternalBusiness` from `lib/osm.ts` unchanged.
- Direct source phone and explicit source WhatsApp URL remain separate fields. Website-derived contacts continue to require confirmed business identity/location; an identity-confirmed phone conflict suppresses the conflicting data.

- [ ] **Step 1: Add failing enrichment tests**

Add tests named `preserves Overture phone and explicit WhatsApp when no website exists`, `never derives WhatsApp from an Overture phone`, and `does not use website contacts or photo when the website identity conflicts`. Assert the first retains the exact source fields, the second returns `whatsapp: null` for a phone-only input, and the third returns no website-derived contacts or image.

- [ ] **Step 2: Run the tests and verify the expected failures**

Run: `npm test -- tests/unit/prospect-enrichment.test.ts`
Expected: the no-website test fails because `enrichOvertureBusinesses` currently clears phone and WhatsApp for businesses without an enrichment result.

- [ ] **Step 3: Implement the minimum preservation change**

Change the no-enrichment branch in `lib/prospect-enrichment.ts` to preserve `business.phone`, `business.whatsapp`, and their source values rather than clearing them. Keep extraction from a site gated by existing identity/location verification and keep image assignment gated by matching official-site name. Do not synthesize a WhatsApp URL from a phone.

- [ ] **Step 4: Verify enrichment and source normalization tests**

Run: `npm test -- tests/unit/prospect-enrichment.test.ts`
Expected: PASS, including existing rejection tests for conflicting websites and acceptance tests for verified official contacts/photos.

- [ ] **Step 5: Commit the isolated contact change**

```bash
git add lib/prospect-enrichment.ts tests/unit/prospect-enrichment.test.ts
git commit -m "fix: preserve source contacts without guessing whatsapp"
```

### Task 2: Normalize Instagram profiles and displayed company names

**Files:**
- Create: `lib/social-links.ts`
- Modify: `lib/display-name.ts`
- Test: `tests/unit/social-links.test.ts`
- Test: `tests/unit/display-name.test.ts`
- Test: `tests/unit/lead-card.test.ts`

**Interfaces:**
- Produce `normalizeInstagramProfileUrl(value: string | null | undefined): string | null` in `lib/social-links.ts`.
- Keep `displayCompanyName(name: string | null | undefined): string` as the UI display helper; do not change the stored/search name.

- [ ] **Step 1: Add failing normalizer tests**

Test normalizing `@cafe.real` and `www.instagram.com/cafe.real/?igsh=abc` to `https://www.instagram.com/cafe.real/`. Test that Instagram posts/reels, non-Instagram hosts such as `instagram.com.attacker.example`, JavaScript URLs, empty values, and multi-segment paths return `null`.

- [ ] **Step 2: Run the normalizer tests and verify they fail because the helper is missing**

Run: `npm test -- tests/unit/social-links.test.ts`
Expected: FAIL because `normalizeInstagramProfileUrl` is not exported yet.

- [ ] **Step 3: Implement URL validation and normalization**

Create the pure helper in `lib/social-links.ts`. Accept a bare `@handle`, bare handle, or HTTPS/HTTP `instagram.com` profile host with exactly one non-reserved profile segment; return HTTPS URL with canonical `www.instagram.com` host and trailing slash. Reject schemes other than HTTP(S), deceptive hosts, posts, reels, stories, and extra path segments.

- [ ] **Step 4: Add failing display-name tests**

Add tests that `Go Coffee Cafeteria, Quiosque ... . A sua melhor opção ...` displays as `Go Coffee Cafeteria`, while `Café, Doces e Cia` remains unchanged and technical ID suffixes are still removed. Keep the original input untouched for persistence/search.

- [ ] **Step 5: Run display-name tests and verify the expected failure**

Run: `npm test -- tests/unit/social-links.test.ts tests/unit/display-name.test.ts`
Expected: social-link tests PASS; the promotional suffix assertion FAILS because `displayCompanyName` only removes technical suffixes.

- [ ] **Step 6: Implement display-only cleanup and verify both helper test files**

For comma-separated names, remove the suffix only when it is at least 50 characters or contains sentence punctuation; preserve short comma-separated business names. Run `npm test -- tests/unit/social-links.test.ts tests/unit/display-name.test.ts`; expected: PASS.

- [ ] **Step 7: Commit the normalization helpers**

```bash
git add lib/social-links.ts lib/display-name.ts tests/unit/social-links.test.ts tests/unit/display-name.test.ts
git commit -m "fix: normalize research social links and display names"
```

### Task 3: Persist authenticated research dismissals

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261016000000_persist_research_dismissals/migration.sql`
- Create: `app/api/research/dismissals/route.ts`
- Test: `tests/unit/research-dismissals-route.test.ts`

**Interfaces:**
- Add Prisma model `ResearchDismissal` with `id`, `ownerId`, `osmId`, `createdAt`, unique `[ownerId, osmId]`, and index `[ownerId]`.
- Provide authenticated `POST /api/research/dismissals` with JSON body `{ osmId: string }`; use `prisma.researchDismissal.upsert` on `ownerId_osmId`, return 204 on success, 400 for invalid IDs, and 401 when unauthenticated.

- [ ] **Step 1: Add failing endpoint tests**

Test unauthenticated 401, malformed body and non-Overture IDs 400, owner ID taken from the session rather than request JSON, and repeated valid requests remaining idempotent for the same user.

- [ ] **Step 2: Run the tests and verify the expected failures**

Run: `npm test -- tests/unit/research-dismissals-route.test.ts`
Expected: FAIL because the route and Prisma model do not exist.

- [ ] **Step 3: Add the Prisma model and additive migration**

Use `TEXT` for IDs, `TIMESTAMP(3)` for `createdAt`, primary key on `id`, unique index on `ownerId, osmId`, index on `ownerId`, and `GRANT SELECT, INSERT, UPDATE, DELETE` on the new table to `atelier_app`. Do not modify or delete any existing rows/tables.

- [ ] **Step 4: Implement the authenticated idempotent route**

Validate a string beginning with `overture/` and a nonempty provider ID no longer than 200 characters. Never accept `ownerId` from the body. Use the composite unique selector to upsert the record and return 204.

- [ ] **Step 5: Verify endpoint tests and Prisma client generation**

Run: `npm test -- tests/unit/research-dismissals-route.test.ts` and `npx prisma generate`.
Expected: endpoint tests PASS and client generation exits 0.

- [ ] **Step 6: Commit the persistence boundary**

```bash
git add prisma/schema.prisma prisma/migrations/20261016000000_persist_research_dismissals/migration.sql app/api/research/dismissals/route.ts tests/unit/research-dismissals-route.test.ts
git commit -m "feat: persist user-scoped research dismissals"
```

### Task 4: Exclude dismissed prospects from every search page

**Files:**
- Modify: `app/api/search/route.ts`
- Test: `tests/unit/search-route.test.ts`

**Interfaces:**
- Change `filterBusinessesForResponse(businesses, filters, ownerId)` to exclude `osmId`s found by `prisma.researchDismissal.findMany({ where: { ownerId, osmId: { in: candidateIds } }, select: { osmId: true } })`.
- Initial and continuation calls pass the already-authenticated `user.id`.

- [ ] **Step 1: Add failing initial-page and continuation tests**

Test that an owner-dismissed company is omitted from an initial search, an undismissed company remains, and a dismissal made after the first page is omitted from the next page of that same progressive search. Also test that another owner's dismissal does not hide the result.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/unit/search-route.test.ts`
Expected: new assertions fail because the route does not query dismissed IDs.

- [ ] **Step 3: Filter by authenticated owner on both response paths**

Add owner-scoped lookup inside `filterBusinessesForResponse` and call it for initial and persisted continuation pages. Preserve current search queue, ordering, search limits, CRM `includeWorked` behavior, and saved-session version checks.

- [ ] **Step 4: Verify the complete search-route suite**

Run: `npm test -- tests/unit/search-route.test.ts`
Expected: PASS, including existing progressive-search and session-ownership tests.

- [ ] **Step 5: Commit search integration**

```bash
git add app/api/search/route.ts tests/unit/search-route.test.ts
git commit -m "feat: hide dismissed prospects from research results"
```

### Task 5: Make research cards consistent and add discard action

**Files:**
- Modify: `components/lead-card.tsx`
- Modify: `app/(app)/pesquisa/page.tsx`
- Modify: `tests/unit/lead-card.test.ts`
- Modify: `tests/e2e/prospect-card-layout.spec.ts`

**Interfaces:**
- Add optional `onDiscard(osmId: string): Promise<void>` prop to `LeadCard`.
- `PesquisaPage.handleDiscard(osmId)` POSTs `{ osmId }`, removes the item from local and module-level saved state only after success, and surfaces request failure without hiding the company.

- [ ] **Step 1: Add failing card and interaction coverage**

Extend card tests to assert category is not rendered below the company name, Instagram links use `normalizeInstagramProfileUrl`, long links use wrapping styles, and the discard action is secondary to “Marcar como abordada”. Extend the E2E fixture with a long promotional name, a long Instagram URL, and multiple contact combinations; test successful discard removes a card and failed discard keeps it visible with an alert.

- [ ] **Step 2: Run tests and verify the new assertions fail**

Run: `npm test -- tests/unit/lead-card.test.ts` and `npm run test:e2e -- --grep "search cards"`.
Expected: unit assertions fail against the current card markup; E2E test exposes mismatched heights/overflow or missing discard behavior.

- [ ] **Step 3: Implement normalized links and stable card layout**

Use the Task 2 helpers in `LeadCard`. Remove the category subtitle. Give the image frame a fixed `h-40`, make the article `h-full` and a column flex layout, clamp the company name to two lines, use `break-all` for long detail links, align the primary action with `mt-auto`, and use equal fractional implicit grid rows in the research results container instead of `items-start`. Retain the existing brand fallback when no verified photo URL exists.

- [ ] **Step 4: Implement persistent discard UI and stable error handling**

Add a visually secondary “Descartar empresa” action. Disable it while posting. Remove the card from both current React state and `savedSearch.businesses` only after the API returns 204; on non-success show an inline role-alert and keep the card. Preserve scroll position and existing approach flow.

- [ ] **Step 5: Run focused unit and E2E card tests**

Run: `npm test -- tests/unit/lead-card.test.ts tests/unit/display-name.test.ts tests/unit/social-links.test.ts` and `npm run test:e2e -- --grep "search cards"`.
Expected: all focused assertions pass; cards align at the bottom, long names/URLs do not stretch or overflow cards, and discard works with success/failure responses.

- [ ] **Step 6: Commit UI behavior and layout**

```bash
git add components/lead-card.tsx "app/(app)/pesquisa/page.tsx" tests/unit/lead-card.test.ts tests/e2e/prospect-card-layout.spec.ts
git commit -m "feat: add research discard action and align prospect cards"
```

### Task 6: Full verification, production deployment, and handoff

**Files:**
- No planned source edits; fix only regressions introduced by Tasks 1–5 and add regression tests before fixes.

- [ ] **Step 1: Run full quality checks**

Run: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
Expected: lint, typecheck, and production build exit 0; tests introduce no new failures. Record any database-dependent or unrelated baseline failure by name and compare it with the pre-change run; do not silently omit it or report it as passing.

- [ ] **Step 2: Apply the additive migration to the configured production database**

Run the repository's approved migration command (`npx prisma migrate deploy`) only after checking that the active `DATABASE_URL` targets this app's configured production database. Confirm the migration is recorded and that no existing table or row was modified.

- [ ] **Step 3: Commit any migration fix and push the feature branch**

Commit only task files, then run `git push origin feat/atelier-approach-mvp`. Confirm the remote branch points at the final tested commit.

- [ ] **Step 4: Deploy to Vercel production and verify the alias**

Use the Vercel deployment flow already linked to this repository. Confirm the production deployment is READY and `https://sistema-pesquisa-xi.vercel.app` points to it. Do not claim deployment success before checking status and alias.

- [ ] **Step 5: Report the delivered behavior and checks**

Summarize source-phone versus WhatsApp behavior, persistent per-user discard, Instagram/photo limits, uniform card layout, test outcomes, final commit, and verified Vercel deployment URL.
