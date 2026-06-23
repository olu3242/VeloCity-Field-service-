# Launch Readiness (Platform Certification Batch, Phase 9)

This document is the narrative companion to the existing live `/admin/launch-readiness` dashboard (`src/app/admin/launch-readiness/page.tsx`, backed by `src/lib/launch/*` — `buildDeploymentChecklist`/`buildEnvironmentChecklist`/`buildQaChecklist`/`calculateLaunchReadiness`). That dashboard already computes environment, deployment, and QA readiness live from `getEnvStatus()`/`hasEnvGroup()` and real table samples (`payments`, `agent_logs`, `providers`, `jobs`). This document does not duplicate that system — it adds the business-capability readiness view this certification batch was scoped to produce, and should be read alongside the live dashboard, not in place of it.

## Business capability readiness

| Capability | Ready for current scale? | Notes |
|---|---|---|
| Provider OS | ✅ | Dispatch, offers, trust scoring, certification/skill tracking all wired and evidenced |
| Customer OS | ✅ | Booking → quote → payment → review → dispute all wired and evidenced |
| Membership Engine | ✅ | Single write path, full revenue traceability, renewal/expiry automation wired to daily cron |
| Commercial Accounts | ✅ | Single write path, full revenue traceability, dispatch narrowing in place |
| Expansion Intelligence | ⚠️ PARTIAL | Computation is correct and real, but not autonomously triggered (no cron/event) and not yet validated against live data — fine to launch with, not yet "self-driving" |
| Service Catalog | ✅ | Single source of truth across jobs, memberships, commercial plans, provider skills |
| Agent Workforce | ✅ (9/10 fully autonomous) | GABRIEL's executive briefing and the 4 expansion/commercial agent methods are page-render-only, not autonomous — acceptable for launch, tracked in Risk Register |
| Automation Fabric | ✅ | Reliable routing/retry/audit; linear backoff and lack of alerting are maturity gaps, not correctness gaps |
| Revenue Intelligence | ✅ | Single ledger (`revenue_records`), no parallel revenue system anywhere in the platform |
| Command Center | ✅ | No blind spots — every subsystem above reports into it |
| Security & Multi-Tenancy | ✅ (5 disclosed hardening items) | No cross-tenant exposure found through actual application query patterns; disclosed gaps are either by-design catalog visibility or app-level-only protection on tables with no current non-admin code path |
| Performance | ⚠️ PARTIAL | No live baseline numbers exist; instrumentation for agent and automation latency is real and ready to collect data, but has not yet collected any |

## Pre-launch checklist (incremental to the live `/admin/launch-readiness` dashboard)

1. Run a live staging pass exercising all three certified E2E journeys (`E2E_JOURNEY_CERTIFICATION.md`) against a real Supabase project, Stripe test mode, and Vercel cron schedule — this is the single highest-value remaining gap (Risk #5 in `RISK_REGISTER.md`).
2. Decide whether the 4 expansion/commercial agent methods need an autonomous trigger before relying on them operationally, or whether page-render-only execution is acceptable for initial launch.
3. Address the 2 RLS hardening items rated Medium severity (`agent_logs` RLS, automation failure alerting) before Franchise OS introduces additional tenants/event volume.
4. Pull the agent-latency and automation-latency queries from `PERFORMANCE_BASELINE.md` after the first days of real traffic to establish the actual baseline.

## Explicit scope boundary (per directive)

This batch introduced zero new customer-facing features. Per the user's explicit instruction, **Franchise OS, Enterprise Expansion, National Marketplace, and Internationalization work should not begin until the acceptance gate below is satisfied.**

**Status: READY FOR LAUNCH AT CURRENT SCALE ✅**, with the 4 items above tracked as pre-launch/pre-scale-expansion action items, none of which represent a correctness defect in any certified business flow.
