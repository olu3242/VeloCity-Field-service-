# Command Center Completeness (Final Go-Live Certification Batch, Phase 7)

Audit of `/admin/command-center` against the eleven required visibility domains, with all blind spots found and closed in this batch.

## Visibility matrix

| Domain | Where it's shown | Status |
|---|---|---|
| Agents | "Agent Health" card (System Health) + full "AI Agent Activity" table (per-agent executions, success rate, avg runtime, last execution), sourced from `agent_logs` | ✅ Covered, previously certified |
| Events | "Event Health" card (volume, success/failure rate, retries) + "Automation Queue" / "Recent Failed Events" cards, sourced from `automation_queue` | ✅ Covered, previously certified |
| Automation | "Automation Health" top-level score card + Event Health + Automation Queue cards, all sourced from real `automation_queue`/`automation_runs` rows | ✅ Covered, previously certified |
| Revenue | "Revenue Health" score card + GMV/net revenue/commission/average-job-value KPIs + "MRR / ARR" and "Plan Profitability" cards (`computeRecurringRevenueIntelligence`) | ✅ Covered, previously certified |
| Memberships | "Membership & Recurring Revenue Intelligence" section: MRR/ARR, renewal/churn, expansion revenue, retention workflows, plan profitability — all real `computeRecurringRevenueIntelligence`/`computeMembershipRetentionIntelligence` output, tenant-scoped (see `TENANT_BOUNDARY_CERTIFICATION.md` #19) | ✅ Covered, previously certified |
| Commercial Accounts | "Expansion & Commercial Intelligence" section: commercial revenue, active contract value, at-risk contracts, renewal pipeline — real `computeCommercialRevenueIntelligence` output | ✅ Covered, previously certified |
| Expansion Intelligence | Same section: expansion pipeline open-opportunity count and revenue impact (`computeExecutiveIntelligence`), plus the separate "Provider Supply Gaps" / "Territory Expansion" cards (`analyzeSupplyGap`, territory health score) | ✅ Covered, previously certified |
| Evidence Health | "Evidence Health" card: agent log volume, audit log volume, access audit volume | ✅ Covered, previously certified |
| **Runtime Controls** | **Not previously shown anywhere on the page** — no reference to `getOperatorState()` existed on Command Center prior to this batch | ❌ Blind spot → ✅ Fixed this batch |
| **Circuit Breakers** | **Not previously shown anywhere on the page**, and — more significantly — `getAllCircuits()` would always have returned an empty list regardless, because nothing in the real automation pipeline ever called `recordSuccess()`/`recordFailure()` | ❌ Blind spot (compounded by a deeper functional gap) → ✅ Fixed this batch |
| **Operator Controls** | `/api/admin/runtime`'s `pause_runtime`/`disable_agent`/`disable_event_type` actions existed and were gated behind `assertAdmin()`, but had no visibility anywhere — an admin had no way to see whether a pause or disable was currently in effect without calling the API directly | ❌ Blind spot → ✅ Fixed this batch |

## What was found and fixed this batch

**1. Command Center had zero visibility into operator/circuit-breaker state.** Confirmed via grep: no reference to `operator`, `circuitBreaker`, `getOperatorState`, or `getAllCircuits` existed anywhere in `src/app/admin/command-center/page.tsx`, and no reference to `/api/admin/runtime` existed anywhere in `src/app/**` at all — the entire operator-control surface (pause, resume, disable agent, disable event type, reset circuit) was only reachable by calling the API directly, with no UI to either invoke it or observe its effect.

**2. A deeper, more serious gap was found while investigating the above**: the real automation pipeline (`src/lib/automation/worker.ts` → `src/lib/automation/router.ts`) never checked `isRuntimePaused()`, `isAgentEnabled()`, or `isEventTypeEnabled()` at all. Calling `pause_runtime` or `disable_agent` via `/api/admin/runtime` mutated `src/lib/governance/operator.ts`'s in-memory state correctly, but that state was never consulted anywhere on the path that actually processes `automation_queue` rows — so every operator control had **zero real effect** on automation processing. The same was true of the circuit breaker: `recordSuccess()`/`recordFailure()` had no callers anywhere in the real pipeline, so circuits could never open and `reset_circuit` had nothing to reset. This is recorded as finding #22 in `CERTIFICATION_REMEDIATION_PLAN.md`.

   Fixed (not new framework — wiring existing exported functions into the real call path):
   - `src/lib/automation/worker.ts` now calls `isRuntimePaused()` before pulling queue rows; a pause holds all pending/failed rows untouched rather than processing or erroring them.
   - `src/lib/automation/router.ts` now calls `isEventTypeEnabled(eventType)` before dispatching to any handler, and gates every individual handler call through a new `callIfEnabled(actionName, fn)` wrapper that also checks `isOpen(actionName)` (skips if that action's circuit is open) and records the real outcome via `recordSuccess(actionName)`/`recordFailure(actionName)`. The wrapper is keyed on the same action-name strings already pushed into each case's `actions` array (e.g. `"alice-intake"`, `"finn-payment"`, `"tess-territory"`), so `disable_agent`/`enable_agent`/`reset_circuit` now act on real, currently-running handlers.

**3. Closed the Command Center visibility gap** by adding a "Runtime & Operator Controls" section (three cards: Runtime State, Disabled Agents/Event Types, Circuit Breakers) that reads `getOperatorState()` and `getAllCircuits()` directly — the same in-memory singletons `/api/admin/runtime` already reads for its `GET` response. This is an addition to the existing Command Center page, not a new dashboard or route, consistent with "extend, never duplicate." The section is explicitly read-only; it does not add pause/disable buttons, since building admin controls into Command Center would be a new UI surface beyond this batch's "no new dashboards" constraint. The card text says so directly, rather than linking to a page that doesn't actually expose those actions (checked: `/admin/lax` does not call `/api/admin/runtime` and has no pause/disable UI — an earlier draft of this fix mistakenly linked there and was corrected before commit).

## Remaining gap, explicitly not fixed in this batch

There is still no admin UI anywhere that *invokes* `pause_runtime`/`resume_runtime`/`disable_agent`/`enable_agent`/`disable_event_type`/`enable_event_type`/`reset_circuit` — only the read side (visibility) was closed. Building that control UI would be a new admin surface (buttons, forms, confirmation flows) beyond a documentation/wiring fix, and is excluded by this batch's "no new dashboards" constraint. Today, an admin who needs to pause runtime or disable an agent must call `/api/admin/runtime`'s `POST` directly (e.g. via `curl` or a script) — Command Center will now correctly show that the action took effect, but does not provide a button to take it. This is recommended as the next concrete UI item once a future batch is authorized to add operator-action controls.

## Status

**CERTIFIED ✅** — all eleven required visibility domains are now represented on `/admin/command-center`, sourced entirely from real evidence tables and the real in-memory governance state (no fabricated or placeholder values). The one blind spot found (Runtime Controls / Circuit Breakers / Operator Controls) is closed for visibility; the deeper functional gap discovered while closing it (operator and circuit-breaker state having no effect on real automation processing) is also fixed, not just documented. The remaining gap (no control UI, only visibility) is explicitly scoped out and recorded above rather than left undisclosed.
