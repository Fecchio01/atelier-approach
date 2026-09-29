# Atelier Approach mobile responsiveness design

## Intent

Make the authenticated Atelier Approach CRM comfortable and reliable on mobile without changing the established desktop experience or its charcoal-and-lime visual identity. The scope covers the shared app shell and the dashboard, CRM funnel, company search, goals, reports, and profile/settings screens.

## Current state

- Desktop uses a persistent left sidebar. Mobile currently replaces it with a sticky header whose five route links share a horizontally scrolling strip, leaving little room for the brand and profile control on narrow devices.
- The CRM's seven primary funnel stages intentionally live in a wide horizontally scrollable board; its 1540px minimum width is contained by a nested overflow region.
- Main page grids already collapse at some Tailwind breakpoints, but several surfaces use generous desktop padding and report tables rely on nested horizontal scrolling without consistent mobile affordances.
- Existing UI uses Tailwind CSS v4 and `@phosphor-icons/react`; no dependency is needed for this work.

## Design

### Shared navigation

Keep the desktop sidebar and its behavior unchanged. On mobile, replace the cramped horizontally scrolling route strip with a sticky compact header containing the Atelier mark/name, a menu button, and profile access. The menu button opens a dark, accessible side drawer with the five existing primary routes (Painel, Funil, Empresas, Metas, Relatórios), a profile link, and the existing sign-out action. Clearly identify the active route. Closing behavior includes route selection, an explicit close control, Escape, and backdrop click; opening the drawer must prevent background scrolling and restore focus when it closes. Use existing Phosphor icons and at least 44px touch targets.

### Page layouts

- Use mobile-first single-column layouts and tighter horizontal page gutters (about 16px) below the existing tablet breakpoint; retain current multi-column desktop/tablet composition where it fits.
- Dashboard metrics, follow-ups, funnel summary, team results, and personal results must fit without document-level horizontal overflow. Tables may scroll inside their own labeled/visually discoverable region.
- Search controls stack and remain usable at 320px; result cards use one column on phones and retain their existing wider grids above mobile breakpoints. Contact actions wrap without clipping.
- The CRM board remains a seven-stage kanban and scrolls horizontally within its own touch-friendly region; it must not widen the document. Keep the active stage/card interaction available on mobile. The lead detail dialog adapts to a near-full-screen mobile surface with internal vertical scrolling, reachable actions, and usable tabs.
- Goals and profile forms become single-column on phones; metric editors, date controls, buttons, and helper/error text must wrap without overlap.
- Reports retain all information. Wide report tables scroll inside their panels, while metric tiles and supporting sections stack cleanly.

### Visual and interaction constraints

Preserve the current logo, icon language, dark surfaces, lime accent, labels, and existing business behavior. Do not add emoji, new color systems, dependencies, data flows, or mobile-only product capabilities. Avoid fixed controls covering important content; respect safe-area insets where a fixed edge is used. Desktop behavior at and above `md` should remain materially unchanged.

## Acceptance criteria

1. At 320, 375/390, and 430 CSS-pixel viewport widths, every in-scope route is readable and actionable, and `document.documentElement.scrollWidth <= window.innerWidth` except for intentional nested scrollers.
2. The mobile drawer opens, exposes every route/profile/sign-out action, marks the current route, and closes by route selection, close control, Escape, or backdrop. Focus and background scrolling are handled accessibly.
3. The CRM's seven columns can be explored with horizontal touch scrolling inside the board without horizontal page overflow; the lead detail dialog remains operable at phone height/width.
4. Search, goal/profile forms, dashboard sections, and report metrics remain usable with no clipped controls, overlapping labels, or unreachable primary actions.
5. Existing desktop layout and core navigation, search, lead-stage, goal, and report functionality continue to work.
6. Automated coverage checks representative narrow viewports and app routes, nested overflow boundaries, drawer behavior, and at least one CRM detail interaction. Run unit tests, lint, typecheck, build, and browser verification where the test environment allows.

## Out of scope

- Replacing the CRM kanban with a different mobile funnel interaction.
- Redesigning page content or branding, changing business logic, or altering desktop navigation.
- Installing dependencies or changing authentication/data-fetching behavior.
