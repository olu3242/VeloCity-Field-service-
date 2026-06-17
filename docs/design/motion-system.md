# Motion & Interaction System (Phase 9)

This documents the motion patterns that exist in the codebase today and
formalizes them as the system going forward, rather than introducing new
animation work. One real accessibility gap was found and fixed.

## 1. Patterns in use

| Pattern | Where | Mechanism |
|---|---|---|
| Hero entrance fade-up | Landing hero badge/title/subtitle/CTAs | CSS `@keyframes landing-fadeUp`, staggered via `.delay-1`..`.delay-4` |
| Scroll-triggered reveal | Service cards, "Why Choose" cards, step items, testimonials | `IntersectionObserver` in `LandingPage.tsx` flips inline `opacity`/`transform`, CSS `transition` animates it |
| Live-status pulse | Online/live indicators (nav dots across all 5 dashboards) | Tailwind `animate-pulse` |
| Brand pulse / spin | Loading states, accent glows | Custom keyframes in `tailwind.config.ts`: `pulse-ring`, `volt-pulse`, `velocity-spin` |
| Loading skeletons | `loading.tsx` per portal | Tailwind `animate-pulse` on gray placeholder blocks |
| Accordion | Radix accordion primitives | `accordion-down`/`accordion-up` keyframes |

This is a coherent, restrained system already — entrances communicate
"this is alive and responding," not decoration for its own sake. No new
motion was added; the goal of this phase was to name what exists and close
the one real gap below.

## 2. Fix applied: `prefers-reduced-motion`

**Finding:** no rule in the codebase respected `prefers-reduced-motion`.
Every animation above (the scroll fade-ins, the pulse/spin loops, the
skeleton shimmer) ran unconditionally for users who have motion reduction
enabled at the OS level — a real accessibility miss, not a style nit.

**Fix:** added a global rule to `src/app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This collapses every animation/transition to effectively instant for
users who've opted out of motion, without touching any component code —
content still ends up in its final visible state (e.g. the scroll
fade-in still reveals cards, just without the animated transition).

## 3. Not done, and why

A more elaborate "motion system" (shared easing tokens, a `useReducedMotion`
hook, Framer Motion adoption, scroll-linked parallax) was in scope per the
master directive's Phase 9 description, but nothing in the current product
needs it — the existing CSS-keyframe + IntersectionObserver approach already
covers every motion need in the app with zero extra dependencies. Adding a
motion library now would be speculative infrastructure for animations that
don't exist yet, which runs against keeping the codebase lean. Recommend
revisiting only if a future feature (e.g. drag-to-reorder, page transitions)
actually requires it.
