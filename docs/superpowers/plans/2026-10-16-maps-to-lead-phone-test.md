# Maps-to-Lead Phone Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand, isolated Maps-to-Lead phone lookup for one Overture business at a time, showing a candidate only after strict identity and location matching.

**Architecture:** Keep the existing Next.js app, OSM geocoding, Overture result discovery, verified-site enrichment, CRM, and metrics unchanged. Add a separate stateless Playwright HTTP service under `services/maps-to-lead-phone`, deployable as its own Vercel container project, plus an authenticated Next.js proxy route and transient per-card UI state. Never persist experimental phone results.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/PostgreSQL for existing authentication only, Playwright/Chromium in a dedicated Node container, Vitest, ESLint, Playwright tests.

**Spec:** `docs/superpowers/specs/2026-10-16-maps-to-lead-phone-verification-design.md`

## Global Constraints

- OSM continues resolving geography; Overture continues providing business results.
- Only an explicit per-card user action may initiate an external Maps lookup.
- Require a unique result matching normalized business name and city/UF; send the selected two-letter UF, reject conflicting address/location and all ambiguous results.
- A Maps result is experimental and is never saved to CRM, reports, goals, or database.
- A mobile number does not prove WhatsApp availability; label it unverified.
- A validated official-site phone takes precedence and is never overwritten.
- The Next.js browser client never receives the service token.
- Failure or timeout of the experimental service must not block normal research.
- Do not alter the current Vercel project's framework, routes, or deployment configuration to host this service.
- Keep upstream `jhowbhz/maps-to-lead` MIT license notices for any adapted/copied code; do not copy unrelated dashboard, SQLite job manager, webhook, or batch-search behavior.

## Review Focus

- Search result from a different city/state — reject it; test in Task 1.
- Similar business names with different locations — reject or mark ambiguous; test in Task 1.
- More than one matching Maps candidate — return ambiguous without a phone; test in Tasks 1 and 2.
- Existing official verified phone — retain it and label the experimental candidate separately; test in Tasks 3 and 4.
- Unauthenticated request, service timeout, or missing service configuration — no phone disclosed and normal search remains usable; test in Task 3.

---

### Task 1: Define strict candidate matching and transient lookup contract

**Files:**
- Create: `lib/maps-phone-lookup.ts`
- Test: `tests/unit/maps-phone-lookup.test.ts`
- Reference: `lib/osm.ts` (`ExternalBusiness` fields)

**Interfaces:**
- Produces `MapsPhoneLookupInput = { name: string; address?: string | null; city: string; region: string }`, where `region` is a Brazilian two-letter UF. `ExternalBusiness` has no city/region properties; the research page supplies these from its active `SearchFilters`.
- Produces `MapsPhoneCandidate = { name: string; phone: string | null; address: string | null; city: string | null; region: string | null }`.
- Produces `matchMapsPhoneCandidate(input, candidates): { status: 'matched'; candidate: MapsPhoneCandidate } | { status: 'none' | 'ambiguous' }`.
- Produces a normalization helper that strips diacritics/punctuation, collapses whitespace, removes only known Brazilian legal suffix tokens, and normalizes UF labels/codes before comparison.

- [ ] **Step 1: Write failing matching tests** for exact normalized name/city/UF match; mismatched city; mismatched UF; incompatible non-empty address; similar names below threshold; two plausible candidates; and no candidates.
- [ ] **Step 2: Run** `npm test -- tests/unit/maps-phone-lookup.test.ts`; confirm the new tests fail because the contract is absent.
- [ ] **Step 3: Implement** candidate normalization and matching. Require exact normalized city and UF, a strong normalized-name match (Dice bigram similarity >= 0.88 or exact match), compatible address when both addresses exist, and exactly one passing candidate. Return `none` for zero; `ambiguous` for multiple; never select the top result on a tie.
- [ ] **Step 4: Run** `npm test -- tests/unit/maps-phone-lookup.test.ts`; confirm all cases pass.
- [ ] **Step 5: Commit** `feat: add strict experimental maps phone matching`.

### Task 2: Build a stateless, one-company Maps-to-Lead HTTP service

**Files:**
- Create: `services/maps-to-lead-phone/package.json`
- Create: `services/maps-to-lead-phone/tsconfig.json`
- Create: `services/maps-to-lead-phone/src/server.ts`
- Create: `services/maps-to-lead-phone/src/lookup.ts`
- Create: `services/maps-to-lead-phone/Dockerfile.vercel`
- Create: `services/maps-to-lead-phone/LICENSE` (upstream MIT notice when adapting code)
- Test: `services/maps-to-lead-phone/tests/lookup.test.ts`

**Interfaces:**
- `POST /lookup`, protected by `Authorization: Bearer <MAPS_PHONE_SERVICE_TOKEN>`.
- Request JSON: `{ companyName: string; city: string; region: string; address?: string | null }`, with `region` a two-letter Brazilian UF.
- Response JSON: `{ candidates: MapsPhoneCandidate[] }`; at most 5 candidates, with only name, phone, address, city, region. No webhook, job ID, database, SQLite, or persistent result store.
- Read `PORT` and `MAPS_PHONE_SERVICE_TOKEN` from environment; fail startup if token missing.

- [ ] **Step 1: Write failing tests** for request validation, missing/bad bearer token, max-five response candidates, no persistence/webhook side effects, Brazilian phone normalization to E.164, and rejection of invalid DDD/toll-free numbers.
- [ ] **Step 2: Run** the service's test command; confirm the tests fail before implementation.
- [ ] **Step 3: Implement** the stateless Express service. Adapt only the Maps page search/detail extraction path from upstream; query with exact company name + city + UF, collect at most five visible candidates without scrolling the entire feed, extract each candidate's name/phone/address from its detail page, use one browser context per request, and close context in `finally`. Normalize valid Brazilian phones to `+55...`, reject values without a valid geographic DDD, return parsed city/UF, and ignore upstream `whatsapp` labels.
- [ ] **Step 4: Add** a container image with the matching Playwright Chromium runtime and an HTTP server bound to `0.0.0.0:$PORT`; do not include SQLite/job manager/dashboard dependencies. Add an upstream attribution/NOTICE containing the repository URL, author, and MIT license text if any upstream implementation code is adapted.
- [ ] **Step 5: Add** service scripts `test: vitest run`, `build: tsc`, and `start: node dist/server.js`; run `npm --prefix services/maps-to-lead-phone test` and `npm --prefix services/maps-to-lead-phone run build`, then confirm the image build includes Chromium.
- [ ] **Step 6: Commit** `feat: add stateless maps phone lookup service`.

### Task 3: Add authenticated Next.js proxy route and failure handling

**Files:**
- Create: `app/api/research/phone-lookup/route.ts`
- Create: `lib/maps-phone-service.ts`
- Test: `tests/unit/maps-phone-service.test.ts`
- Test: `tests/unit/maps-phone-lookup-route.test.ts`
- Reference: `lib/auth.ts`, `app/api/search/route.ts`

**Interfaces:**
- `POST /api/research/phone-lookup` accepts `{ business: MapsPhoneLookupInput }` and returns `{ status: 'matched'; candidate: MapsPhoneCandidate } | { status: 'none' | 'ambiguous' }`.
- `MAPS_TO_LEAD_PHONE_API_URL` and `MAPS_TO_LEAD_PHONE_API_TOKEN` are server-only environment variables.
- `lookupMapsPhone(business, { baseUrl, token, fetchImpl?, timeoutMs? })` validates upstream response and uses a bounded timeout of 45 seconds.

- [ ] **Step 1: Write failing tests** for anonymous 401; malformed business 400; absent env 503; upstream 502/timeout 503; valid candidate match; mismatched/ambiguous candidate rejection; upstream never receives CRM-only fields.
- [ ] **Step 2: Run** the two focused Vitest files and confirm failure.
- [ ] **Step 3: Implement** service client and route. Authenticate with `getCurrentUser`; validate name/city/state/address lengths; send only those fields to service; use bearer token server-side; pass returned candidates through Task 1 matcher; return generic provider errors without logging phone values.
- [ ] **Step 4: Add** a per-user in-memory throttle of 5 lookups/minute in the route, return 429 with `Retry-After: 60`, and clear expired entries when checking; UI also disables duplicate concurrent requests.
- [ ] **Step 5: Run** focused tests and `npm run typecheck`; confirm all pass.
- [ ] **Step 6: Commit** `feat: add authenticated maps phone lookup route`.

### Task 4: Add the explicit lookup action to research result cards

**Files:**
- Create: `components/maps-phone-lookup.tsx`
- Modify: `components/lead-card.tsx`
- Test: `tests/unit/maps-phone-lookup.test.tsx`
- Reference: `app/(app)/pesquisa/page.tsx`, `lib/contact-links.ts`

**Interfaces:**
- `MapsPhoneLookup` props: `{ business: ExternalBusiness; city: string; region: string }`; result state stays in component memory only.
- Research card receives city and UF from active search filters. Parse UF from the selected region label (for example, `São Paulo, SP` → `SP`). Offer “Testar telefone no Maps” only when both are present; a state-wide search without a selected city does not offer lookup. A verified official phone remains primary and is never overwritten.

- [ ] **Step 1: Write failing component tests** for idle action; loading/disabled state; matched candidate labeled “Telefone encontrado — conferir / WhatsApp não confirmado”; none/ambiguous/error messages; official phone remains unchanged; no CRM persistence request is sent.
- [ ] **Step 2: Run** the focused Vitest component test and confirm failure.
- [ ] **Step 3: Implement** a small component that posts only the selected company's permitted identity/location fields to the Next route, displays result and error states accessibly, and links to `tel:` plus an optional “Testar no WhatsApp” action using the existing helper without claiming the account is confirmed.
- [ ] **Step 4: Integrate** the component in the card without inserting experimental fields into `ExternalBusiness`, search-session persistence, or `/api/leads` payload.
- [ ] **Step 5: Pass** `filters.city` and `filters.region` from `app/(app)/pesquisa/page.tsx` through `LeadCard`; omit the lookup action if either value is empty.
- [ ] **Step 6: Run** focused UI tests, `npm run lint -- components/lead-card.tsx components/maps-phone-lookup.tsx 'app/(app)/pesquisa/page.tsx'`, and `npm run typecheck`.
- [ ] **Step 7: Commit** `feat: add on-demand phone test to research cards`.

### Task 5: Regression verification and isolated Vercel deployment readiness

**Files:**
- Test: `tests/e2e/research-phone-lookup.spec.ts`
- Modify only if needed: `.gitignore`, `services/maps-to-lead-phone/README.md`
- Reference: `vercel.json`, current Vercel project settings (read-only until deployment is explicitly safe)

**Interfaces:**
- An end-to-end mocked lookup proves the existing discovery/search response is unchanged and CRM remains untouched.
- Service is deployed as a separate Vercel project rooted at `services/maps-to-lead-phone`; the current app project retains its framework and routing configuration.

- [ ] **Step 1: Write** the E2E regression that performs a normal Overture search with mocked data, invokes one card lookup with a mocked service response, and asserts OSM/Overture filters, result count, CRM request body, and metrics are unchanged.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/research-phone-lookup.spec.ts`; verify the mocked flow, mismatch, and CRM-isolation assertions pass.
- [ ] **Step 3: Run** all unit tests, `npm run lint`, `npm run typecheck`, and the existing `tests/e2e/research-to-crm.spec.ts`; correct only failures caused by this feature.
- [ ] **Step 4: Verify** Vercel project access and container support without changing the current app project. If available, prepare the separate service deployment and set `MAPS_TO_LEAD_PHONE_API_URL` and `MAPS_TO_LEAD_PHONE_API_TOKEN` on the existing app project using Vercel's secure environment workflow. If separate deployment cannot be created without changing the main project's framework/routing or requires unavailable access, stop before deploy and report the exact user action needed; do not publish a broken main deployment.
- [ ] **Step 5: Smoke test** the isolated service and authenticated Next proxy with one explicit lookup; verify mismatch returns no number and no CRM/report/goal/database state changes.
- [ ] **Step 6: Commit** any regression fixes as `test: verify isolated maps phone lookup`; push the feature branch and deploy the main app only after the separate service is reachable and build/test checks pass.

## Execution Notes

- Tasks 1 → 2 → 3 → 4 → 5 have interface dependencies and should be implemented in order in one native session with task-level commits.
- Container deployment behavior and project configuration are subject to the linked Vercel account's available features; verify before attempting production deployment. Official references: [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Vercel Services](https://vercel.com/docs/services).
