# Design System Audit — Global Component Inventory

Scope: every shared UI primitive in `src/components/ui/`, its real adoption count across the codebase, and the gaps that block "build once, apply everywhere." This audit is grounded in a direct import-count search across `src/`, not estimation.

## 1. Adoption counts (import sites, current)

| Component | Import count | Status |
|---|---|---|
| `Button` | 41 | Adopted — primary primitive across the app |
| `Card` | 31 | Adopted — primary primitive across the app |
| `Input` | 6 | Under-adopted — several forms still use raw `<input>` |
| `Select` | low, but present | Adopted where used |
| `Table` | 0 | **Built this session, zero adoption** |
| `Dialog` | 0 | **Built this session, zero adoption** |
| `Tabs` | 0 | **Built this session, zero adoption** |
| `DropdownMenu` | 0 | **Built this session, zero adoption** |
| `Sheet` | 0 | **Built this session, zero adoption** |

`Button`, `Card`, and `Select` are the only primitives with real, organic adoption today. `Table`, `Dialog`, `Tabs`, `DropdownMenu`, and `Sheet` exist as code (added earlier in this initiative, modeled on the existing shadcn/Radix pattern) but have not yet replaced a single hand-rolled equivalent. They are infrastructure without usage — the gap this sprint starts closing.

## 2. Known hand-rolled alternative (first migration target)

`src/app/provider/earnings/page.tsx` renders three raw `<table>` elements (Completed Jobs, Tips Received, Payout History) instead of the shared `Table` family. This is the only confirmed hand-rolled table in customer/provider-facing code. It is the lowest-risk, highest-symbolism adoption target: pure markup swap, no data or logic change. See `phase-convergence-certification.md` for the applied fix.

## 3. Missing variants / inconsistencies found

- **Empty states**: no shared `<EmptyState>` component existed before this initiative (added earlier this session and wired into all five dashboards — customer, provider, admin, dispatch, franchise). No further gap here.
- **Stat/KPI cards**: no shared `<StatCard>` existed before this initiative (added earlier this session, wired into all five dashboards). No further gap here.
- **Loading states**: each dashboard has its own `loading.tsx` skeleton; skeletons were updated for the mobile-grid fixes earlier this session but are not built on a single shared `<Skeleton>` primitive — every page hand-rolls its skeleton markup. This is real fragmentation: a visual change to "what loading looks like" today requires editing 5+ files. Flagged as debt, not fixed in this pass (no shared `Skeleton` component currently exists in `src/components/ui/`, and creating one is new infrastructure beyond this sprint's scope per the "no unnecessary new primitives" directive).
- **Forms**: `Input` has only 6 import sites against dozens of form fields across booking, profile, and settings pages — meaning most form fields are raw `<input>`/`<textarea>` with ad hoc Tailwind classes rather than the shared component. Flagged for a future pass; not touched here to avoid a wide-blast-radius change to working forms.
- **Navigation**: no single shared nav/sidebar component — admin, provider, dispatch, franchise, and customer portals each implement their own header/nav markup. This is consistent with them being genuinely different audiences with different nav needs, but the *visual language* (spacing, active-state styling) is not derived from one shared source, so a global nav style change would require touching 5 files.

## 4. What's already healthy

- `Button` and `Card` are used consistently enough that there is no fragmented "alternate button" or "alternate card" pattern anywhere in the audited surfaces (customer, provider, admin, dispatch, franchise, landing).
- The five primitives added this session (`Dialog`, `Tabs`, `DropdownMenu`, `Table`, `Sheet`) follow the exact same `React.forwardRef` + `cn()` + Radix-primitive pattern as the pre-existing `Select`, so adopting them going forward requires no new conventions to learn.

## 5. Recommendation

Do not build new primitives. Spend the next cycle of design-system work on **adoption**, not invention:
1. Migrate `provider/earnings/page.tsx` to `Table` (done this pass).
2. When the next dialog/modal/dropdown need arises anywhere in the app, reach for the existing `Dialog`/`DropdownMenu`/`Sheet` rather than hand-rolling a new one.
3. Defer the shared `Skeleton` primitive and wider `Input` adoption to a dedicated pass — both are real gaps but touch many files and carry more regression risk than this sprint's "quick win" mandate allows.
