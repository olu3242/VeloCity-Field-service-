# VeloCity Field Service — Architecture Verification

> Last verified: 2026-07-21. Reflects the codebase as of the production-hardening sprint.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.29 — App Router, React Server Components |
| Styling | Tailwind CSS 3.4, dark theme (`bg-gray-950 text-white`), accent `#CCFF00` |
| Database | Supabase (PostgreSQL 15), Row Level Security, Realtime |
| Auth | Supabase SSR auth — `@supabase/ssr`, cookie-based sessions |
| Payments | Stripe (Connect + Webhooks + PaymentIntents) |
| AI | Anthropic Claude via `@anthropic-ai/sdk` — 10 named agents |
| Notifications | Twilio SMS + SendGrid email (both optional; features degrade gracefully) |
| Maps | Google Maps (optional) |
| Cron | Vercel Cron Jobs (6 schedules defined in `vercel.json`) |
| Hosting | Vercel (assumed) |

---

## User Roles

Five roles are enforced in middleware, Supabase RLS policies, and the persona-based RBAC system:

| Role | Portal | Description |
|---|---|---|
| `customer` | `/dashboard` | Books services, tracks jobs, pays invoices, reviews providers |
| `provider` | `/provider` | Accepts job offers, submits quotes, completes jobs, receives payouts |
| `admin` | `/admin` | Full platform visibility, provider approvals, dispute resolution, analytics |
| `franchise_owner` | `/franchise` | Manages a franchise territory — providers, revenue, local ops |
| `dispatcher` | `/dispatch` | Manually assigns and re-routes jobs; read access to all active jobs |

`super_admin` is treated as an alias for `admin` in middleware route guards and grants no additional DB permissions beyond `admin`.

---

## 10 AI Agents

All agents are built on `BaseAgent` (`src/lib/agents/base.ts`), call Anthropic Claude, and are registered in `src/lib/agents/registry.ts`.

| Agent | File | Capability | Key Events Handled |
|---|---|---|---|
| **ALICE** | `alice.ts` | Customer intake & classification | `job.created`, `job.reclassify_requested` |
| **MAX** | `max.ts` | Job dispatch & provider matching | `job.dispatch_requested`, `job.provider_unassigned` |
| **QUINN** | `quinn.ts` | Quote generation & review | `quote.created`, `quote.review_requested`, `job.quote_disputed` |
| **NOVA** | `nova.ts` | Workflow orchestration & status transitions | `job.status_change_requested`, `job.provider_arrived`, `job.completed`, `job.cancelled` |
| **REX** | `rex.ts` | Quality assurance & trust scoring | `review.submitted`, `provider.trust_score_requested`, `job.completed` |
| **IVY** | `ivy.ts` | Dispute resolution | `dispute.opened`, `dispute.evidence_submitted`, `dispute.escalated` |
| **FINN** | `finn.ts` | Payment processing & payout management | `payment.payout_requested`, `payment.failed`, `payment.refund_requested`, `job.completed` |
| **LENA** | `lena.ts` | Customer retention | `job.completed`, `customer.churn_risk_detected`, `review.submitted` |
| **TESS** | `tess.ts` | Territory analysis & demand sensing | `territory.analysis_requested`, `provider.supply_check`, `demand.surge_detected` |
| **GABRIEL** | `gabriel.ts` | Governance & compliance | `audit.compliance_check_requested`, `provider.onboarding_review`, `dispute.escalated`, `payment.anomaly_detected` |

All agents fall back to deterministic logic (no Anthropic call) when `ANTHROPIC_API_KEY` is absent, checked via `hasEnv()` in `src/lib/env.ts`.

---

## Automation Pipeline

### Event Types

74 distinct event types flow through the automation router (`src/lib/automation/router.ts`). Categories:

- **Job lifecycle** — `job.created`, `job.dispatch_requested`, `job.provider_arrived`, `job.completed`, `job.cancelled`, and ~12 others
- **SLA** — `sla_warn`, `sla_breach`, `sla_escalate`, `job_stuck`, `no_provider_accepted`
- **Payment** — `payment.payout_requested`, `payment.failed`, `payment.refund_requested`, `payout_released`
- **Dispute** — `dispute.opened`, `dispute.evidence_submitted`, `dispute.escalated`
- **Quote** — `quote.created`, `quote.review_requested`, `job.quote_disputed`
- **Review** — `review.submitted`
- **Tip** — `tip.submitted`
- **Provider** — `provider.trust_score_requested`, `provider.supply_check`, `demand.surge_detected`
- **Growth** — `high_demand_area_detected`, `provider_shortage_detected`, `surge_pricing_recommended`, `recurring_service_opportunity_detected`, `provider_subscription_opportunity_detected`, `customer_churn_risk_detected`, `territory_ready_for_expansion`, `franchise_candidate_area_detected`
- **Membership** — `membership.created`, `membership.renewed`, `membership.cancelled`, `membership.payment_failed`
- **Franchise** — `franchise.created`, `franchise.territory_assigned`, `franchise.provider_added`
- **Audit/compliance** — `audit.compliance_check_requested`, `payment.anomaly_detected`
- **Predictive** — `predictive.demand_forecast`, `predictive.churn_alert`

### 16 Automation Handlers

Each handler is a module under `src/lib/automation/handlers/`:

| Handler File | Responsibility |
|---|---|
| `alice-intake.ts` | Classifies new jobs via ALICE |
| `max-dispatch.ts` | Dispatches jobs to providers via MAX |
| `quinn-quote.ts` | Generates and reviews quotes via QUINN |
| `nova-workflow.ts` | Orchestrates job status transitions via NOVA |
| `rex-completion.ts` | Post-completion quality scoring via REX |
| `ivy-dispute.ts` | Dispute investigation via IVY |
| `finn-payment.ts` | Payout and refund processing via FINN |
| `lena-retention.ts` | Post-job retention outreach via LENA |
| `tess-territory.ts` | Territory demand/supply analysis via TESS |
| `provider-offer.ts` | Sends provider offer notifications |
| `payout-release.ts` | Releases queued payouts after hold period |
| `tip-submitted.ts` | Handles tip events and provider notification |
| `sla-check.ts` | Routes SLA warn/breach/escalate events |
| `franchise-lifecycle.ts` | Franchise onboarding and territory events |
| `predictive-signals.ts` | Routes predictive demand and churn signals |
| `membership-lifecycle.ts` | Membership create/renew/cancel/failure events |

### Circuit Breakers

The automation router implements per-handler circuit breakers. Each handler tracks consecutive failure counts; after exceeding the threshold the circuit opens and events are logged to `automation_events` with `status = "circuit_open"` rather than retried. The circuit resets after a cooldown window.

---

## 6 Cron Jobs

Defined in `/vercel.json`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/sla` | `* * * * *` (every minute) | SLA breach detection, expired offer cleanup, stuck job detection |
| `/api/cron/automation` | `*/5 * * * *` (every 5 minutes) | Processes the pending automation event queue |
| `/api/cron/payouts` | `0 * * * *` (hourly) | Releases queued payouts whose hold period has elapsed |
| `/api/cron/daily-intelligence` | `0 6 * * *` (6 AM daily) | Territory analysis, demand forecasting, growth signals |
| `/api/cron/daily` | `0 3 * * *` (3 AM daily) | Churn risk detection, membership renewal reminders, retention triggers |
| `/api/cron/predictive` | `0 7 * * *` (7 AM daily) | Predictive ops — capacity forecasting, surge prediction |

All cron routes require the `Authorization: Bearer <CRON_SECRET>` header. Vercel sets this automatically; direct calls without the secret return 401.

---

## Database

**103 tables across 28 migrations** (`supabase/migrations/`).

### Migration sequence

| File | Description |
|---|---|
| `001_initial_schema.sql` | Core tables: `profiles`, `providers`, `jobs`, `service_areas`, `reviews` |
| `002_automation_engine.sql` | Automation queue, event log, circuit breakers |
| `002_production_hardening.sql` | Index hardening, function security |
| `003_tenant_demarcation.sql` | `tenant_id` columns, `tenants` table, RLS policies |
| `004_growth_intelligence.sql` | Growth signals, territory analytics tables |
| `005_automation_core.sql` | Handler registry, retry queue |
| `006_tips_after_service.sql` | Tips table and tip flow |
| `006_velocity_additive_bridge.sql` | Additive schema patches |
| `007_pricing_payments_automation.sql` | `payout_queue`, pricing rules, payment events |
| `008_access_control_settings.sql` | Persona permissions, RBAC settings |
| `008_real_world_ops.sql` | Dispatch queue, provider offers, check-in logs |
| `009_formula_validation_views.sql` | Read-only formula validation views |
| `010_execution_memory.sql` | Agent execution memory, context snapshots |
| `011_runtime_platform.sql` | Runtime event bus tables |
| `012_neural_runtime.sql` | Neural runtime metadata (post-MVP, tables exist but flagged off) |
| `013_runtime_consolidation.sql` | Runtime table consolidation and index cleanup |
| `014_hardening.sql` | Security hardening: search_path fixes, function ownership |
| `015_auth_and_queue_hardening.sql` | Auth trigger hardening, queue deduplication |
| `016_service_catalog.sql` | Service types, categories, pricing templates |
| `017_provider_skills_certification.sql` | Provider skills, certifications, verification records |
| `018_franchise_os_rls.sql` | Franchise-specific RLS policies |
| `20260529120000_fix_profiles_search_path.sql` | `search_path` security fix for profile functions |
| `202605290930_auth_signup_bootstrap_repair.sql` | Auth trigger repair for signup edge cases |
| `20260530000001_revenue_records.sql` | Revenue ledger tables |
| `20260530000002_membership_engine.sql` | Membership plans, subscriptions, usage |
| `20260530000003_expansion_commercial_accounts.sql` | Commercial account and expansion tables |
| `20260530000004_enterprise_intelligence.sql` | Enterprise KPI views and intelligence tables |

---

## Critical Production Dependencies

These npm packages are directly in the request/response path and must be present for core features:

| Package | Version | Role |
|---|---|---|
| `next` | 14.2.29 | Framework |
| `@supabase/supabase-js` | ^2.49.4 | Database client |
| `@supabase/ssr` | ^0.6.1 | Cookie-based auth in App Router |
| `stripe` | ^17.7.0 | Payments, Connect, webhooks |
| `@anthropic-ai/sdk` | ^0.36.3 | AI agents |
| `zod` | ^4.4.3 | Schema validation, env validation |
| `@sendgrid/mail` | ^8.1.6 | Transactional email |
| `twilio` | ^6.0.2 | SMS notifications |
| `recharts` | ^3.8.1 | Analytics dashboards |
| `zustand` | ^5.0.3 | Client-side state management |
| `lucide-react` | ^0.469.0 | Icon library |
| `date-fns` | ^4.1.0 | Date formatting across the UI |

---

## Dead Code Map — Post-MVP Modules with No Connected UI or API

These `src/lib/` modules are compiled into the bundle but have no route, page, or API endpoint wired up. They are excluded from the MVP launch surface. Each module is protected by the corresponding feature flag in `src/lib/feature-flags.ts`.

| Module Directory | Feature Flag | Description |
|---|---|---|
| `src/lib/neural-runtime/` (schema only via migration 012) | `NEURAL_RUNTIME` | Adaptive model selection runtime |
| `src/lib/federation/` | `FEDERATION_NETWORK` | Cross-tenant federation hub and router |
| `src/lib/global-workflows/federation-registry.ts` | `FEDERATION_NETWORK` | Federation workflow registry |
| `src/lib/swarm-coordination/` | `SWARM_COORDINATION` | Distributed agent consensus layer |
| `src/lib/evolution/` | `EVOLUTION_CYCLES` | Agent policy self-modification engine |
| `src/lib/evolution-control/` | `EVOLUTION_CYCLES` | Evolution cycle governance |
| `src/lib/autonomous-remediation/` | `AUTONOMOUS_REMEDIATION` | Incident runbook executor |
| `src/lib/autonomous-governance/` | `AUTONOMOUS_REMEDIATION` | Drift detection, governance health |
| `src/lib/autonomous-optimization/` | `AUTONOMOUS_REMEDIATION` | Cost and workflow optimizers |
| `src/lib/elastic-scale/` | `ELASTIC_SCALE` | Infrastructure scaling APIs |
| `src/lib/shared-intelligence/` | `FEDERATION_NETWORK` | Cross-tenant shared intelligence |
| `src/lib/global-intelligence/` | `FEDERATION_NETWORK` | Global-level intelligence aggregation |
| `src/lib/regional-runtime/` | `ELASTIC_SCALE` | Per-region runtime management |
| `src/lib/mesh/` | `FEDERATION_NETWORK` | Service mesh coordination |
| `src/lib/distributed-queues/` | `FEDERATION_NETWORK` | Cross-instance queue federation |
| `src/lib/simulation/` | none | Ops simulation (dev only) |
| `src/lib/ops-simulation/` | none | Ops scenario simulation |
| `src/lib/certification/` | none | Enterprise certification reports |
| `src/lib/adaptive-governance/` | none | Adaptive policy governance |
| `src/lib/ai-marketplace/` | none | AI capability marketplace |
| `src/lib/automation-marketplace/` | none | Automation template marketplace |
| `src/lib/cross-platform/` | none | Cross-platform connector stubs |
| `src/lib/ecosystem-connectors/` | none | External ecosystem integrations |
| `src/lib/plugins/` | none | Plugin system scaffolding |
| `src/lib/maturity/` | none | Platform maturity scoring |
| `src/lib/velocity-os/` | none | VelocityOS meta-platform layer |

---

## Tenant Boundary

### DEFAULT_TENANT_ID

```
00000000-0000-4000-8000-000000000001
```

Defined in `src/lib/tenancy.ts`. All single-tenant deployments use this ID. In future multi-tenant deployments, each franchise or enterprise customer gets a unique UUID.

### getTenantId() — strict resolution

Use for all user-facing API routes. Reads `profile.tenant_id` and **throws** `ApiError(TENANT_RESOLUTION_FAILED)` if the field is null or missing. This surfaces as a 500 and logs a structured error that must be investigated — it means a user exists without a tenant assignment.

### getTenantIdOrDefault() — safe fallback

Use in cron jobs, Stripe webhook handlers, and internal automation where no authenticated session is available. Always accepts a nullable string and falls back to `DEFAULT_TENANT_ID` while emitting a `console.warn` tagged `[TENANT_FALLBACK]` with the calling context. This makes silent fallbacks visible in production log aggregation.

### withTenant()

Convenience helper that merges `{ tenant_id }` into any object before a Supabase insert, avoiding forgotten `tenant_id` columns.
