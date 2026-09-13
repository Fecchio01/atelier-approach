# Prospect Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich OSM prospects from official public websites, render clickable contact actions, and prioritize approachability.

**Architecture:** A server-only module fetches only the OSM-provided homepage under strict timeout, response-size and cache limits. OSM remains authoritative; only missing contact fields are filled, then the existing research and CRM flows receive normalized values.

**Tech Stack:** Next.js 15, TypeScript, Prisma/SQLite, Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-09-12-prospect-enrichment-design.md`

## Global Constraints

- Use OSM only for discovery; no Google Maps/search-engine scraping.
- Fetch only public OSM-provided sites with a 5 second timeout and 1 MB cap.
- Store normalized contacts only; do not store raw HTML.
- Render only safe `https`, `http`, `tel`, and `https://wa.me` links.

---

### Task 1: Extract public contact links

**Files:** `lib/prospect-enrichment.ts`, `tests/unit/prospect-enrichment.test.ts`

- [ ] Write a failing test that supplies public HTML with `wa.me`, Instagram, `tel:` and `og:image`.
- [ ] Run `npm test -- --run tests/unit/prospect-enrichment.test.ts` and confirm failure.
- [ ] Implement `enrichFromOfficialWebsite(website)` returning `{ phone, whatsapp, instagram, website, imageUrl }`, with URL validation, cache, timeout, cap and null-on-failure behavior.
- [ ] Re-run the test and commit `feat: enrich prospects from official websites`.

### Task 2: Merge and rank results

**Files:** `lib/osm.ts`, `lib/lead-score.ts`, `tests/unit/osm.test.ts`, `tests/unit/lead-score.test.ts`

- [ ] Write failing tests showing OSM values win over enrichment and a WhatsApp prospect ranks before telephone, site-only and no-contact prospects.
- [ ] Run `npm test -- --run tests/unit/osm.test.ts tests/unit/lead-score.test.ts` and confirm failure.
- [ ] Merge only absent fields and export `approachabilityRank` where WhatsApp=0, telephone=1, Instagram/site=2, neither=3.
- [ ] Re-run tests and commit `feat: prioritize actionable enriched prospects`.

### Task 3: Make cards actionable

**Files:** `components/lead-card.tsx`, `app/(app)/pesquisa/page.tsx`, `tests/e2e/acceptance.spec.ts`

- [ ] Write a failing browser test for a mocked prospect with a WhatsApp link, phone, Instagram, site and image.
- [ ] Run that test and confirm the card lacks safe accessible links.
- [ ] Render optional cover image and accessible actions: WhatsApp, Ligar, Instagram and Site; sort by approachability then existing score/name.
- [ ] Re-run test and commit `feat: add clickable prospect contact actions`.

### Task 4: Retain enriched data in CRM

**Files:** `app/api/leads/route.ts`, `tests/unit/lead-routes.test.ts`, `tests/e2e/research-to-crm.spec.ts`, `prisma/schema.prisma` if an additive field is required.

- [ ] Write a failing route test that posts enriched fields and asserts they remain on the created lead.
- [ ] Run it and confirm failure.
- [ ] Persist missing new fields safely, run `npm test -- --run && npm run lint && npm run typecheck && npm run build`.
- [ ] Manually verify real research → actionable card → CRM persistence → next search excludes the approached company.
- [ ] Commit `feat: retain enriched prospect contacts in CRM`.
