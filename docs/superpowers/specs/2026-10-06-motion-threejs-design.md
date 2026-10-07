# Motion and Three.js Design

## Goal

Add intentional, polished motion to the Arvello CRM without changing its visual identity, business logic, or the quick navigation users rely on. Add one restrained Three.js detail to the main dashboard as progressive enhancement, not as a required part of the interface.

## Experience

- Preserve the existing dark Arvello palette, lime accent, typography, logo, spacing language, and responsive layouts.
- Use Motion (`motion/react`) only where state changes benefit from continuity: modal/sheet entry and exit, tabs or segmented-control selection, toast/inline feedback, goal progress changes, and CRM funnel card movement when these states actually change.
- Keep transitions short and subtle. Navigation and route changes must never wait for an animation; no blocking transition, artificial delay, or animation that prevents input.
- Keep straightforward hover, focus, and press feedback in CSS. Do not convert every element to a Motion component.
- Add one small, decorative Three.js visual accent on the main dashboard, coordinated with Arvello's existing lime/neutral palette. It must not replace or reinterpret the logo, compete with dashboard data, or spread across other routes.
- Load the Three.js scene lazily and only on the dashboard. On small screens, reduced-motion preference, WebGL failure, or constrained devices, show a lightweight static fallback. The dashboard and all CRM actions remain fully usable without WebGL.

## Motion and rendering safeguards

- Centralize duration/easing/spring values and use the shared motion/reduced-motion conventions from `motion-foundations` and `motion-patterns`.
- Respect `prefers-reduced-motion` in both Motion and the Three.js accent; reduced motion means a static scene/no nonessential movement, not merely a slower loop.
- Keep animated content SSR-safe: no browser globals during server render and no hydration-dependent random output.
- The Three.js canvas is decorative (`aria-hidden`, non-focusable, no pointer interception). Limit pixel ratio and scene complexity; pause rendering when offscreen or the document is hidden; cancel animation frames and dispose geometries, materials, renderer, and listeners on unmount.
- Avoid continuous animation unless it conveys useful ambient presence. The 3D accent should be low-motion and should stop when not visible.

## Out of scope

- Rebranding, logo edits, color-system changes, or a broad visual redesign.
- Route/page transitions that delay navigation; perpetual animation across cards; sound/haptics.
- Requiring WebGL, canvas, or animation to access information or complete a business action.
- Changes to CRM, goals, reports, persistence, APIs, or database behavior.

## Validation

- Verify existing lint, typecheck, unit tests, and production build.
- Exercise dashboard and CRM interactions on desktop and mobile: modal open/close, period/tab changes, progress feedback, funnel movement, and immediate route navigation.
- Verify reduced-motion behavior, keyboard/focus behavior, screen-reader hiding of the decorative canvas, WebGL-unavailable fallback, and no horizontal overflow on mobile.
- Confirm Three.js is in a dashboard-only lazy chunk and the scene stops when hidden/offscreen and cleans up after navigation.
- Check the final dashboard at desktop and mobile sizes for visual restraint and ensure it does not obscure metrics or controls.

## Delivery

After implementation and verification, push the changes to the existing GitHub branch and deploy to the existing `sistema-pesquisa` Vercel production project, then verify the deployment is ready. Do not alter or replace any other Vercel project.
