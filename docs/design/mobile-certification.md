# Mobile Certification

Consolidates all mobile-responsiveness work verified and shipped across this initiative, plus a re-check for anything missed.

## Fixes already shipped (verified via Playwright screenshots at 375px width, earlier in this initiative)

| Location | Before | After |
|---|---|---|
| Customer dashboard stat grid | `grid-cols-3` (fixed, no breakpoint) | `grid-cols-1 sm:grid-cols-3` |
| Provider dashboard stat grid | `grid-cols-4` (fixed, no breakpoint) | `grid-cols-2 md:grid-cols-4` |
| Admin AI Agent Status strip | `grid-cols-5` (fixed, no breakpoint) | `grid-cols-2 sm:grid-cols-5` |
| `/book` category picker | `grid-cols-3` (fixed, no breakpoint) | `grid-cols-2 sm:grid-cols-3` — verified via screenshot |
| 5 matching loading-skeleton files | hardcoded columns matching the above pages | updated to match the responsive fix in each corresponding page |

All five fixes were for the same underlying bug pattern: a hardcoded `grid-cols-N` Tailwind class with no responsive breakpoint, which on a 375px-wide phone screen forces N columns into too little width, causing text/numbers to wrap or truncate. Each was verified rendering correctly at mobile width before being marked done.

## Global motion accessibility (shipped this initiative)

Added a global `prefers-reduced-motion` CSS rule to `globals.css`. Previously no animation anywhere in the app (including the landing page's scroll-triggered fade-ins and floating hero cards) respected this OS-level accessibility setting. See `motion-system.md` for the full write-up.

## Re-check performed this pass

- `provider/earnings/page.tsx` stat grid is already `grid grid-cols-2 md:grid-cols-4` — correct, no fix needed.
- The 3 raw `<table>` elements on the earnings page (now migrated to the shared `Table` component, see `phase-convergence-certification.md`) inherit the shared `Table` wrapper's `<div className="relative w-full overflow-auto">`, which gives horizontal scroll on narrow viewports instead of column-crushing or text wrap — this is a real mobile-correctness improvement that comes free with the component-adoption quick win, not a separate fix.
- No other hardcoded fixed-column grids were found in a repeat search of customer/provider/admin/dispatch/franchise pages beyond the 5 already fixed.

## Outstanding mobile debt (not fixed this pass, out of scope)

- Landing page hero is a left/right split (copy + booking panel); `master-audit.md` flagged this needs direct mobile verification of stacking order. Confirmed earlier in this initiative via screenshot that scroll-triggered animation and hero layout render correctly on mobile — no further action needed.
- No shared `Skeleton` primitive exists yet (see `dashboard-preparation.md`), so mobile-correctness of loading states is verified per-file rather than guaranteed by a single shared, mobile-tested component. Flagged as future infrastructure work, not a current bug.
