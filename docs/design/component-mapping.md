# Component Mapping — Surface → Component Audit

Maps every real surface in the app to the components it actually uses, flags redundant/hand-rolled patterns, and corrects route-naming assumptions against the real codebase.

## 1. Route-naming corrections (factual check against the real app)

Two names referenced in planning conversations do not correspond to real pages in this codebase:
- There is **no "Forgot Password" flow**. `src/app/auth/` contains only `login/`, `signup/`, and `callback/`. Password reset is not implemented. This is a real gap, not a naming mismatch — flagged here because any "map every auth surface" exercise will otherwise silently skip it.
- There is no page named "Mission Control" or "Growth Center." The real names are:
  - `/admin/growth` → h1 "Growth Intelligence"
  - `/admin/lax` → nav label "LAX Command Center"

## 2. Confirmed naming collision — "Command Center" (real bug, found via direct code read)

Three distinct admin surfaces independently call themselves a variant of "Command Center":

| Route | Label used | Source |
|---|---|---|
| `/admin/dashboard` | h1: "Command Center" | `admin/dashboard/page.tsx:96` |
| `/admin/command-center` | nav brand: "Velocity Command Center"; h1: "Revenue + Operations Command Center" | `admin/command-center/page.tsx:236,248` |
| `/admin/lax` | header label: "LAX Command Center"; links to `/admin/command-center` calling it just "Command Center" | `admin/lax/page.tsx:143,158,484` |

An admin user navigating this app encounters the phrase "Command Center" attached to three different pages, one of which links to a second one using the exact same label minus the "LAX" prefix. This is a real internal-navigation clarity bug, not a cosmetic nit — recommend renaming `/admin/dashboard`'s h1 to something role-specific (e.g. "Admin Overview") and reserving "Command Center" for the one page that already brands itself that way (`/admin/command-center`). Left unfixed in this pass per Part 17 (admin-internal, non-trivial rename touching nav copy in 3 files — outside the "quick win" risk budget) but documented here as the top follow-up item.

## 3. Surface → component table

| Surface | Route | Components used | Notes |
|---|---|---|---|
| Landing | `/` | Hand-rolled sections (`landing.css`), `LandingPage.tsx` | Already migrated off the legacy static-HTML approach (see Part 1 history in `master-audit.md`); real DB-sourced stats and testimonials, not componentized via shared `Card`/`Button` since it's a distinct marketing surface with its own visual system — acceptable, this is standard practice for landing pages even in mature design systems. |
| Login | `/auth/login` | `Button`, `Input` (form) | Standard. |
| Signup | `/auth/signup` | `Button`, `Input` (form) | Standard. |
| Forgot Password | — | **does not exist** | See section 1. |
| Customer dashboard | `/dashboard` | `Card`, `StatCard`, `EmptyState`, `Button` | Fully on shared primitives (StatCard/EmptyState added earlier this session). |
| Provider dashboard | `/provider/dashboard` | `Card`, `StatCard`, `EmptyState`, `Button` | Fully on shared primitives. |
| Provider earnings | `/provider/earnings` | `Card`, **3 raw `<table>` elements** | Migrated to shared `Table` family this pass — see `phase-convergence-certification.md`. |
| Admin dashboard | `/admin/dashboard` | `Card`, `StatCard`, `EmptyState`, `Button` | Fully on shared primitives; involved in the Command Center naming collision (section 2). |
| Dispatch dashboard | `/dispatch/dashboard` | `Card`, `StatCard`, `EmptyState`, `Button` | Fully on shared primitives. |
| Franchise dashboard | `/franchise/dashboard` | `Card`, `StatCard`, `EmptyState`, `Button` | Fully on shared primitives. |
| Booking | `/book` | `Button`, category-picker grid (custom) | Mobile grid fixed earlier this session (`grid-cols-3`→`grid-cols-2 sm:grid-cols-3`). |
| Jobs detail | `/dashboard/jobs/[id]` | `Card`, `Button`, status badges (custom) | No table/dialog usage found. |
| Settings | `/admin/settings` | `Card`, `Button` | "Access Settings" — role/permission management, not user profile settings; no separate customer/provider "Settings" page exists today. |
| Payments | `/admin/payments`, `/admin/payouts` | `Card`, `Button` | No shared `Table` usage yet — both pages render tabular payment/payout data with custom markup; candidates for a future `Table` migration pass (not touched this pass to keep blast radius to the one confirmed earnings-page win). |
| Reports | `/admin/growth`, `/admin/launch-readiness` | `Card`, `StatCard` | Both are score/metric-dashboard style pages, not tabular reports. |

## 4. Footer link audit (landing page, real finding)

`LandingPage.tsx` footer renders four columns of links. Several point to routes that don't correspond to their label's real destination:
- "About Us", "Terms of Service", "Privacy Policy" all link to `/` (home).
- "Help Center" and "Contact Us" both link to `/dashboard` (the authenticated customer dashboard, not a public help/contact page).

These are not dead links in the sense of 404s — they resolve — but they are mislabeled, sending a visitor looking for a Privacy Policy to the homepage and a logged-out visitor looking for Help to an auth-gated dashboard. No real About/Careers/Terms/Privacy/Help/Contact pages exist in `src/app/` today. Recommend building these as real pages in a future pass; not fabricated here, since inventing placeholder legal/company content would itself violate the "no Lorem Ipsum, no fake content" standard this sprint is enforcing.

## 5. Summary

- No redundant *component* implementations were found beyond the one already-known `provider/earnings` raw-table case (now migrated).
- The real structural issue in this codebase is **naming clarity** (Command Center collision) and **footer link accuracy**, not component fragmentation — the design system itself is in better shape than the routing/copy layer around it.
