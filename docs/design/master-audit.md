# VeloCity — Master Design & Conversion Audit (Phase 1)

Scope: landing page, customer/provider/admin dashboards, navigation, mobile, visual system, conversion paths, empty states, visual assets. No code changed in this phase.

---

## 1. Landing Page

**Source:** `src/app/page.tsx` reads a static file, `"Landing page HTML for VeloCity Field Service"`, off disk at request time, regex-extracts `<style>` and `<body>`, rewrites `href="#"` placeholders positionally by counting occurrences, and injects the result via `dangerouslySetInnerHTML` in `src/components/landing/original-landing-page.tsx`.

### Architecture debt (blocks everything else)
- The page is not a React component tree — it's a raw HTML blob. There is no way to swap in real data, real screenshots, or componentized sections without either editing a flat HTML file by hand or rewriting it as JSX. Any visual/content change in later phases requires migrating this to real components first.
- Link wiring is positional and silent: `mapLandingLinks` assumes the 5th `href="#"` is "Become a Provider" by counting matches. Adding or removing a CTA in the HTML silently breaks unrelated links with no compile-time signal.
- No tests, no type safety, no lint coverage on this file — it's invisible to the rest of the app's tooling.

### Banned-terminology violations (explicit, not borderline)
| Location | Text | Problem |
|---|---|---|
| Nav | `AI Agents` | exposes internal architecture as a nav item |
| Hero subhead | "powered by AI dispatch" | leads with mechanism, not outcome |
| Services section sub | "dispatched in real-time by our AI matching engine" | "engine" is infrastructure language |
| Why-card 02 | "JUST-IN-TIME DISPATCH" / "Our AI matches you..." | logistics jargon, not a customer outcome |
| Why-card 06 | "AI QUALITY CONTROL" / "Our AI monitors service outcomes... SLA breaches" | "SLA" is an internal ops term a homeowner has never heard |
| **Entire "AI Agents" section** | `ALICE — Intake Agent`, `MAX — Dispatch Agent`, `QUINN — Quote Agent`, `NOVA — Workflow Agent`, `REX — Quality Agent`, `IVY — Dispute Agent`, headline "10 Specialized AI Agents", subhead "VeloCity runs on a full AI Operating System" | This is the single biggest violation in the spec. A visitor sees internal agent codenames and an orbiting-node diagram — this is system architecture marketing, the opposite of benefit-first communication. It reads as an engineering demo, not a service. |
| How-it-works step 2 | "AI Matches" | mechanism-first label |
| Footer column header | `AI System` with `ALICE — Intake`, `MAX — Dispatch`, `QUINN — Quotes`, `REX — Quality` | repeats the violation in the footer |
| Footer brand line | "powered by AI dispatch and specialized agents" | same |
| Footer status line | `V·OS ACTIVE · AI DISPATCH ONLINE ●` | literal system-status readout in the footer of a marketing page |

Net effect: roughly 15% of all on-page copy is internal-system framing rather than customer-outcome framing, concentrated in one full section plus a footer column that exist for no reason a visitor would care about.

### Visual-first debt
- Zero real screenshots, zero product renders, zero photography anywhere on the page. The "hero card stack" (`Marcus R. — En Route`, `Job Completed ✓ · AC Repair · $220 · 4.9⭐`) is a CSS mockup, not a captured screen — close to the right idea, but currently illustrative rather than authentic.
- The agent-orbit diagram (`agent-hub`, `agent-node` ring) is exactly the kind of "floating node / orbiting tech" decoration the spec calls out to eliminate, and it's also the section most in violation on copy grounds — same section fails both rules at once.
- The "How It Works" 5-step row is text-only (`step-num`, `step-title`, `step-desc`) — no timeline graphic, no connecting visual, despite being the ideal candidate for a horizontal flow diagram.
- Estimated current visual/text ratio: roughly 25% visual / 75% text, against a 70/30 visual-first target.

### Trust debt
- Trust bar claims "4.9 Avg Rating — Across 10,000+ reviews" with no testimonial, no name, no logo, no link to actual reviews anywhere on the page. This is an unsupported claim exactly as the spec warns against.
- No testimonials section exists at all.
- No customer logos, case studies, or before/after proof anywhere.
- Stats bar (`48 Active Jobs Today`, `12 Service Categories`, `85+ Verified Providers`, `10K+ Completed Services`) is the right idea (live-feeling numbers) but is hardcoded into the static HTML, not sourced from the database — so it will drift from reality immediately and is itself an unsupported claim today.

### Conversion debt
- All primary CTAs (`Book a Service`, `Become a Provider`, `Book Your First Service`) are correctly outcome-labeled — this part is fine.
- Hero leads with a badge ("REAL-TIME FIELD SERVICE DISPATCH") and subhead that both foreground the mechanism before the outcome. The H1 itself ("YOUR LOCAL SERVICE, AT VELOCITY") is brand-voice but doesn't state an outcome either — a first-time visitor reaches the third line of copy before any concrete benefit appears.
- No social proof anywhere above the fold or near any CTA, which is where it converts best.

### Mobile debt
- CSS media query coverage is thin: only one `@media` breakpoint collapses `.agents-layout` to a single column and hides `.agents-visual` entirely on small screens (visible at line ~683 of the source HTML) — meaning most sections (hero split, services grid, why-grid, steps-row, footer columns) have no confirmed mobile treatment in the audited file and need direct device testing.
- The hero is a left/right split (copy + booking panel) — common failure mode on mobile is the booking panel pushing all hero copy below the fold; needs verification.

---

## 2. Customer Dashboard (`src/app/dashboard/page.tsx`)
- Light theme, clean 3-stat layout (Active Jobs / Completed / Total Spent) — appropriately simple, scannable in well under 5 seconds.
- Empty state for no jobs has a CTA ("Book a Service") but no illustration/icon — falls short of the spec's empty-state standard (illustration + icon + next action + guidance).
- Job list rows are plain — no status-forward visual hierarchy beyond a badge; acceptable but not distinctive.
- No realtime indicator on this page currently (a `RealtimeJobUpdates` component exists in the codebase but is not yet wired into this page — noted as a known gap from prior work, not new debt found here).

## 3. Provider Dashboard (`src/app/provider/dashboard/page.tsx`)
- Dark theme, 4 top-line KPIs (New Offers / Active Jobs / Today's Earnings / Trust Score) — good, decision-relevant metrics, no vanity metrics present.
- A second "Growth Intelligence" block stacks 4 more score cards plus 3 forecast/recommendation cards below the fold — by the time a provider scrolls past 11 total metric tiles, the 5-second comprehension bar is at risk; this section is denser than the spec's "actionable, not overwhelming" guidance, even though every individual number is legitimate (no placeholders, no Lorem Ipsum, all DB-sourced).
- Job offer cards and active-job cards use icon + status badge well; consistent with card-first design.
- No empty-state illustration when there are no jobs — text-only ("No jobs yet...").

## 4. Admin Dashboard (`src/app/admin/dashboard/page.tsx`)
- KPI set (Total Jobs, Active Jobs, Open Disputes, Pending Providers) is decision-relevant, not vanity.
- Heavily operational/text-dense by nature (this is an internal ops tool, not a sales surface) — acceptable for its audience, but if it is ever shown in a sales demo it currently looks like a technical console (raw counts, no charts/sparklines, no visual trend indicators).
- AI agent status strip (ALICE/MAX/NOVA/QUINN/etc. with live on/off dots) is appropriate *here* — this is an internal admin tool, not customer-facing, so agent-name exposure is not a violation in this context. Flagging only so Phase 6 doesn't accidentally treat internal agent names as universally banned — the rule applies to customer-facing surfaces.

## 5. Component System
- `Card`, `Badge`, `Button` are reused consistently across all three audited dashboards — no fragmentation found there.
- No shared empty-state component exists; each page hand-rolls its own (plain-text) empty state. A single `<EmptyState icon title action />` component would resolve the empty-state debt across customer, provider, and admin in one pass.
- No shared KPI-card or stat-card primitive; every dashboard hand-builds its own `<Card><CardContent>` stat block with slightly different markup. Worth consolidating before any visual refresh, so a style change only needs to happen once.

---

## Debt Register Summary

| Category | Severity | Where | Fix complexity |
|---|---|---|---|
| Internal-architecture exposure on landing page (full "AI Agents" section + footer column + scattered copy) | **Critical** | Landing page | Medium — needs copy rewrite + section redesign, not just find/replace |
| Landing page is unmaintainable static HTML injected via `dangerouslySetInnerHTML` | **Critical** | `src/app/page.tsx`, `original-landing-page.tsx` | High — should become real JSX components before any other landing change is durable |
| Zero real screenshots/photography anywhere on landing page | High | Landing page | High — needs actual app screenshots or commissioned imagery, not generated by code edits alone |
| Unsupported trust claims (10,000+ reviews, hardcoded stats) with no testimonials section | High | Landing page | Medium |
| Agent-orbit diagram is decorative "floating tech node" visual | Medium | Landing page agents section | Low once section is rewritten |
| Mobile breakpoint coverage unverified beyond one section | Medium | Landing page CSS | Needs device testing pass before fixing |
| No shared empty-state / KPI-card components | Medium | All dashboards | Low-medium, pays off across every future dashboard change |
| Provider dashboard exceeds 5-second-scan target (11 stat tiles) | Low-Medium | Provider dashboard | Low |
| Hero leads with mechanism ("AI dispatch", "real-time dispatch") before outcome | Low-Medium | Landing page hero | Low |

---

## Recommendation

The landing page's two **Critical** items are blocking: as long as it's a flat HTML string, no later phase (design system, component refactor, visual asset strategy) can durably attach to it. The highest-leverage next step is converting the landing page to real JSX sections *before* any visual/copy rework, so subsequent phases edit components instead of re-patching a string blob.

The "AI Agents" section is the clearest single fix with the highest visible impact: replacing six agent codenames and an orbit diagram with an outcome-framed "what happens to your request" timeline addresses the Critical terminology violation, the visual-first target, and the AI-slop elimination goal in one section rewrite.

This audit intentionally made no code changes. Recommend reviewing this debt register and confirming priorities before Phase 2 (Design System) begins.
