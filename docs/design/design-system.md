# VeloCity Design System — Current State Audit (Phase 2)

This document inventories the design tokens and component primitives that
actually exist in the codebase today, identifies gaps against the
component-standardization list from the master design directive, and
records concrete recommendations. It does not change any code; it is the
Phase 2 deliverable that gates Phase 3+ work.

## 1. Color tokens

Two parallel brand palettes exist, both fully defined in `tailwind.config.ts`:

| Token | Hex (500/300) | Used for |
|---|---|---|
| `velocity-{50..950}` | `#6070f2` (500) | Customer-facing surfaces — landing page, customer dashboard, buttons, links |
| `velocity-volt-{50..950}` | `#CCFF00` (300) | Dark "operator" portals — provider, admin, dispatch, franchise (lime accent on near-black) |
| `velocity-black` / `velocity-carbon` / `velocity-white` | `#0A0A0A` / `#111827` / `#F9FAFB` | Dark-portal backgrounds/text |

A second, duplicate source of truth exists at `src/config/theme.ts`
(`THEME.colors.volt`, `THEME.volt.{50..950}`) with the same values as
`velocity-volt`. Nothing currently imports `THEME` outside `src/config/theme.ts`
itself — it's dead duplication, not an active conflict.

**Finding:** 13 files use the raw arbitrary value `text-[#CCFF00]` /
`bg-[#CCFF00]` / `border-[#CCFF00]/30` instead of the `velocity-volt-300`
token that already exists for the same color. Purely cosmetic debt (zero
visual difference today) but it means a future rebrand requires a
find-and-replace across hardcoded hex strings instead of one Tailwind
config edit. Lowest-priority item in the register below.

**Finding:** shadcn's `--card`, `--background`, etc. CSS variables have a
`.dark` block defined in `globals.css`, but no element in the codebase ever
applies the `.dark` class (confirmed via repo-wide grep). Dark portals
achieve their look entirely through manual `bg-gray-950`/`bg-gray-900`/
`text-white` utility classes on a light-mode `<Card>`. This works but means
the shadcn dark-mode system is effectively unused scaffolding. Not worth
activating retroactively — the manual-override pattern is already
consistent and `StatCard`/`EmptyState` formalize it via `variant="dark"`.

## 2. Typography

No type-scale tokens are defined in `tailwind.config.ts` — every page uses
Tailwind's default scale ad hoc (`text-2xl font-bold` for page titles,
`text-3xl`/`text-4xl font-bold` for stat values, `text-sm`/`text-xs` for
metadata). This is consistent in practice across the five dashboards
already audited, but it is not codified anywhere, so consistency depends on
copy-pasting patterns rather than a shared scale.

Observed de facto scale (worth formalizing if a real type-scale token set
is added in a future pass):

| Role | Class | Example |
|---|---|---|
| Page title | `text-2xl font-bold` | "My Dashboard", "Provider Dashboard" |
| Section heading | `text-lg font-semibold` | "Active Jobs", "Growth Intelligence" |
| Stat value | `text-3xl font-bold` (now: `StatCard`) | KPI numbers |
| Body | `text-sm` | card metadata, descriptions |
| Caption | `text-xs` | timestamps, hints |

## 3. Spacing & radius

No custom spacing scale — Tailwind defaults throughout. Radius is the
single shadcn token `--radius: 0.5rem`, consumed via `rounded-lg/md/sm`.
No findings here; this is already consistent because it's the framework
default and nobody has overridden it ad hoc.

## 4. Icon system

There is no SVG icon library (no lucide-react, heroicons, etc. installed).
All iconography is emoji: `SERVICE_CATEGORY_ICONS` (`src/lib/utils/index.ts`)
maps each `ServiceCategory` to a single emoji (🔧 plumbing, ⚡ electrical,
❄️ hvac, etc.), and ad hoc emoji are used for section/empty-state icons
("🧰", "📋", "💝"). This is consistent and lightweight, but it means icon
weight/style can't be art-directed (emoji render differently per OS/browser)
and there's no monochrome variant for places that need a single accent
color. Flagged as Medium debt — not blocking, but a real icon set would be
needed before any "polished, Stripe/Linear-grade" visual bar is met.

## 5. Component inventory

**Exists** (`src/components/ui/`):
`Button`, `Card` (+ Header/Title/Description/Content/Footer), `Badge`,
`Input`, `Label`, `Select`, `Textarea`, `StatCard`, `EmptyState`.

**Missing** against the standardization checklist in the master directive:
`Tabs`, `Dialog`/`Modal`, `Drawer`/`Sheet`, `Table`, `Dropdown`/`Menu`,
`Sidebar`/persistent nav shell, `Toast`/notification surface beyond the
existing one-off `NotificationBell`.

None of the current pages use ad hoc reimplementations of these (no inline
modal/tabs/table hand-rolling found in the dashboards audited so far), which
means the gap is currently invisible — but any future feature that needs a
modal or a data table will either hand-roll one-off markup or require this
gap to be filled first. Recommend building these on top of Radix primitives
(already a dependency via `tailwindcss-animate` + shadcn conventions) only
when a concrete feature needs one, rather than speculatively building all
seven now.

## 6. Debt register (Phase 2)

| Item | Severity | Effort | Notes |
|---|---|---|---|
| Hardcoded `#CCFF00` instead of `velocity-volt-300` token (13 files) | Low | Low | Cosmetic, zero visual change; safe mechanical cleanup whenever those files are next touched |
| Duplicate `THEME` object in `src/config/theme.ts` vs `tailwind.config.ts` | Low | Low | Dead code — nothing imports it; candidate for deletion |
| No formal typography scale token set | Low | Medium | De facto scale is already consistent; only matters if scale needs to change globally |
| Emoji-only icon system | Medium | High | Real icon set is a prerequisite for Stripe/Linear-grade visual polish; requires picking + integrating a library and re-pass on every page that uses `SERVICE_CATEGORY_ICONS` |
| Missing Tabs/Dialog/Drawer/Table/Dropdown primitives | Medium | High | No current page is blocked on this; build on demand |

## 7. Recommendation

Of these, only the icon system gap has real visual-polish impact, and it's
also the most expensive item (requires a library decision, asset review for
each of the ~12 service categories, and a pass through every page that
renders `SERVICE_CATEGORY_ICONS`). The rest are low-severity, low-urgency
cleanup that doesn't change what a visitor sees today.

This phase intentionally produced no code changes, consistent with the
master directive's audit-before-code rule.
