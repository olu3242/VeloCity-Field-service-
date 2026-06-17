# Dashboard Preparation — Roadmap Only

Per the directive: this is an audit and roadmap, not a redesign. No dashboard layout, markup, or styling is changed in this document or in this pass beyond what's already covered by `design-system-audit.md` (component adoption) and the mobile-grid fixes already shipped earlier in this initiative.

## Current state (real, verified)

All five dashboards (`/dashboard`, `/provider/dashboard`, `/admin/dashboard`, `/dispatch/dashboard`, `/franchise/dashboard`) already share:
- `StatCard` for top-line KPIs
- `EmptyState` for zero-data states
- `Card`/`Button` for the rest of the layout
- Mobile-responsive stat grids (fixed earlier this session: customer `grid-cols-1 sm:grid-cols-3`, provider `grid-cols-2 md:grid-cols-4`, admin AI-status strip `grid-cols-2 sm:grid-cols-5`)

This means the *infrastructure* prerequisite for a future visual refresh (a shared component layer to refresh once and propagate everywhere) is already in place. A future dashboard redesign pass would be a styling/layout change on top of existing shared components, not a rebuild.

## Roadmap items for a future dashboard pass (not started)

1. **Provider dashboard density** (flagged in `master-audit.md` section 3, still true): 11 total metric tiles between the top KPI row and the "Growth Intelligence" block below the fold risks exceeding the 5-second comprehension target. Recommend a future pass collapse the secondary forecast/recommendation cards behind a "View growth details" expansion rather than always-rendering all 11.
2. **Shared `Skeleton` primitive**: as noted in `design-system-audit.md`, every dashboard's `loading.tsx` hand-rolls its own skeleton markup. A future pass should extract one shared `Skeleton` component so a loading-state visual change only needs to happen once.
3. **Table adoption for tabular dashboard data**: `/admin/payments` and `/admin/payouts` render tabular data with custom markup rather than the now-available shared `Table` family (the same family just adopted in `provider/earnings` this pass). Natural next migration target once the earnings-page pattern is validated in production.
4. **Realtime indicator on customer dashboard**: a `RealtimeJobUpdates` component exists in the codebase but isn't wired into `/dashboard` (carried over from `master-audit.md` section 2, still unresolved — confirmed still true, no realtime wiring found on this page in this pass).
5. **Command Center naming collision**: resolving the three-way "Command Center" label collision (`component-mapping.md` section 2) should happen before any visual redesign of those three admin pages, so the redesign doesn't bake in confusing nav copy.

## Explicit non-goals for this pass

- No dashboard layout changes beyond what's already shipped (mobile grids, StatCard/EmptyState adoption).
- No new KPI metrics added or removed.
- No changes to dashboard data-fetching logic.
