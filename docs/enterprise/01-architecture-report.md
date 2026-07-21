# Enterprise Architecture Report

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Branch:** `claude/build-velocity-field-service-JVoOY`

---

## 1. Platform Overview

VeloCity Field Service is a multi-tenant field-service marketplace built on the following runtime stack:

| Layer | Technology |
|---|---|
| Application framework | Next.js 14 App Router (React Server Components + API Routes) |
| Database | Supabase — PostgreSQL 15, hosted, with PostGIS extension |
| Auth | Supabase Auth (JWT, cookie-based sessions via `@supabase/ssr`) |
| Payments | Stripe (PaymentIntents, Connect, Subscriptions, Webhooks) |
| AI inference | Anthropic Claude API (`claude-sonnet` via `@anthropic-ai/sdk`) |
| SMS notifications | Twilio (optional — degrades gracefully when absent) |
| Email notifications | SendGrid (optional — degrades gracefully when absent) |
| Maps | Google Maps Embed API (optional — degrades gracefully when absent) |
| Queue | In-memory + PostgreSQL (`automation_queue` table) |
| Deployment | Vercel (serverless, auto-deploy from `main` branch) |

There is no Redis, no Kafka, and no dedicated message broker. The automation queue is backed by the `automation_queue` table in Supabase with exponential-backoff retries managed by the worker process (`src/lib/automation/worker.ts`).

---

## 2. Component Map

The application exposes four distinct user portals, each isolated behind role-gated middleware:

| Portal | Path prefix | Required role | Description |
|---|---|---|---|
| Customer portal | `/dashboard` | Any authenticated user | Job booking, quote approval, payment, review |
| Provider portal | `/provider` | `provider` | Job acceptance, check-in, quote submission, completion |
| Admin console | `/admin` | `admin` or `super_admin` | Platform-wide operations, approvals, reporting, AI agents |
| Franchise portal | `/franchise` | `franchise_owner`, `admin`, or `super_admin` | Territory management, operator oversight, royalty tracking |
| Dispatch view | `/dispatch` | `dispatcher`, `admin`, or `super_admin` | Live queue management, provider matching |

Authentication is handled in `src/middleware.ts`. All unauthenticated requests to protected paths redirect to `/auth/login`. Role checks are done server-side against the `profiles` table (`role` column).

---

## 3. Database Schema

The database schema is built across 28 migration files in `supabase/migrations/`. The migrations are structured as follows:

| Migration | Content |
|---|---|
| `001_initial_schema.sql` | Core tables: profiles, providers, customer_addresses, jobs, job_status_history, quotes, payments, reviews, disputes, provider_offers, subscriptions, notifications, agent_logs. RLS enabled on all. Indexes on status, category, customer_id, provider_id. |
| `002_automation_engine.sql` | automation_events, automation_queue, automation_runs. Indexes on status + next_retry_at for queue polling. |
| `003_tenant_demarcation.sql` | `tenants` table. Adds `tenant_id` column to all existing tables with NOT NULL constraint and DEFAULT pointing to the default tenant UUID `00000000-0000-4000-8000-000000000001`. Adds tenant_id indexes. |
| `004_growth_intelligence.sql` | Growth tracking tables |
| `005_automation_core.sql` | Automation handler registry |
| `006_tips_after_service.sql` | `tips` table |
| `007_pricing_payments_automation.sql` | `payouts`, `revenue_records`, payout automation |
| `008_access_control_settings.sql` | RBAC permission tables, `audit_logs` |
| `008_real_world_ops.sql` | Real-world operations support tables |
| `009_formula_validation_views.sql` | Computed views for financial formulas |
| `010_execution_memory.sql` | `execution_memories`, `workflow_snapshots`, AI decision lineage tables |
| `011_runtime_platform.sql` | Runtime platform metadata |
| `012_neural_runtime.sql` | Neural runtime tables (post-MVP, gated by FEATURE_FLAGS) |
| `013_runtime_consolidation.sql` | Consolidation and deduplication |
| `014_hardening.sql` | Hardening constraints and indexes |
| `015_auth_and_queue_hardening.sql` | Queue hardening, available_at column |
| `016_service_catalog.sql` | Service catalog and pricing |
| `017_provider_skills_certification.sql` | Provider skill certification |
| `018_franchise_os_rls.sql` | Franchise portal RLS policies: franchise_territories, territory_operators, territory_scorecards, expansion_recommendations |
| `20260530_*.sql` | `revenue_records`, membership engine, commercial accounts, `enterprise_memory` |
| `20260721000001_dead_letter_queue.sql` | `automation_dead_letters` with tenant_id, original_queue_id, error_message, resolved_at |

**RLS status:** Row Level Security is enabled on all tables. The `service_role` key (used via `getAdminClient()` in `src/lib/supabase/admin.ts`) bypasses RLS for worker and admin API operations. All user-facing queries go through the `createClient()` path which respects RLS.

---

## 4. Integration Map

| Integration | Purpose | Authentication | Notes |
|---|---|---|---|
| Stripe API | PaymentIntents, Connect payouts, Subscriptions | `STRIPE_SECRET_KEY` | Required at startup |
| Stripe Webhooks | `payment_intent.*`, `customer.subscription.*`, `payout.*`, `account.updated` | `STRIPE_WEBHOOK_SECRET` (HMAC) | Signature verified via `stripe.webhooks.constructWebhookEvent` before any payload processing |
| Supabase | Database + Auth + Realtime | `SUPABASE_SERVICE_ROLE_KEY` (server), anon key (client) | Required at startup |
| Anthropic Claude | AI agent inference and natural-language analysis | `ANTHROPIC_API_KEY` | Required at startup. Agents have deterministic fallback paths. |
| Twilio | SMS job status notifications | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Optional. Feature check via `isFeatureConfigured("twilio")` |
| SendGrid | Transactional email notifications | `SENDGRID_API_KEY` | Optional. Feature check via `isFeatureConfigured("sendgrid")` |
| Google Maps | Job location display | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional. Map widgets hidden when key absent. |
| Google OAuth | Social login | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Optional |

All required integrations are validated at startup by `src/env.ts` using a Zod schema. Missing required variables cause an immediate startup failure with a structured error message listing each missing variable.

---

## 5. AI Agent Layer

Ten specialist agents are defined in `src/lib/agents/coordinator.ts` under `ALL_SPECIALIST_AGENTS`:

| Agent type | Specialist function | Primary data sources |
|---|---|---|
| `executive-advisor` | Revenue and retention intelligence | `computeExecutiveIntelligence`, `computeRecurringRevenueIntelligence` |
| `customer-success` | Membership churn and renewal risk | `computeMembershipRetentionIntelligence` |
| `finance-agent` | GMV, fees, pending payouts, open disputes | `revenue_records`, `payouts`, `disputes` tables |
| `risk-analyst` | Circuit breaker state, provider trust, contract health | `getAllCircuits()`, `providers`, `commercial_contracts` |
| `compliance-agent` | Audit log volume, agent error rates | `audit_logs`, `agent_logs` tables |
| `provider-coach` | Provider growth and pricing opportunities | `computeProviderGrowthIntelligence` |
| `growth-strategist` | Territory expansion and readiness | `franchise_territories`, `calculateCityReadinessScore`, `calculateTerritoryOpportunityScore` |
| `dispatch-agent` | Queue depth, SLA risk, emergency job count | `jobs` table, `forecastSlaRisk` |
| `franchise-advisor` | Territory coverage, unmanned territory detection | `franchise_territories`, `territory_operators` |
| `commercial-advisor` | Contract attainment, renewal pipeline | `computeCommercialRevenueIntelligence` |

All agents are called via `coordinateAgents(tenantId, agentTypes)` which runs them in parallel with `Promise.all()`. Each agent returns an `AgentAnalysis` object with `confidence`, `summary`, `recommendations`, and `reasoning`. Each agent fails independently — an error in one does not block the others. Coordination results are persisted to `enterprise_memory` via `storeEnterpriseMemory()`.

Agent execution is gated at the operator level: `isAgentEnabled(agentName)` from `src/lib/governance/operator.ts` is checked before each run. Circuit breaker state (`isOpen(key)` from `src/lib/governance/circuit-breaker.ts`) is also checked per-agent.

---

## 6. Multi-Tenant Model

Every table in the database carries a `tenant_id` UUID column set to NOT NULL, added by `003_tenant_demarcation.sql`. The default tenant (`00000000-0000-4000-8000-000000000001`) is used for single-tenant deployments and as a fallback for cron/webhook contexts.

Tenant ID is resolved in application code via two functions defined in `src/lib/tenancy.ts`:

- `getTenantId(profile)` — throws `TENANT_RESOLUTION_FAILED` (HTTP 500) if `profile.tenant_id` is null. Used in all user-facing API routes.
- `getTenantIdOrDefault(value, context)` — returns `DEFAULT_TENANT_ID` when null, always emitting a `[TENANT_FALLBACK]` console warning with the caller's context string. Used only in Stripe webhook handlers, cron jobs, and the automation queue worker.

Data writes always go through `withTenant(tenantId, data)` which injects `tenant_id` into the insert payload before it reaches Supabase.

---

## 7. Event-Driven Automation

The automation pipeline follows a queue → worker → router → handler pattern:

1. **Emit:** `emitAutomationEvent(type, payload)` in `src/lib/automation/emitEvent.ts` writes a row to `automation_queue` with `status = "pending"`.
2. **Pick up:** `processAutomationQueue(client, limit, tenantId)` in `src/lib/automation/worker.ts` polls `automation_queue` for rows with `status IN ("pending", "failed")` and `available_at <= now()`, up to `limit` (default 10) rows per run.
3. **Route:** `routeAutomationEvent(eventType, payload, client)` in `src/lib/automation/router.ts` dispatches to the registered handler for the event type.
4. **Handle:** Each handler returns a `HandlerResult` with `success`, `output`, and optional `emitEvents` for chaining.
5. **Dead-letter:** After `MAX_RETRIES = 3` failures, the row is written to `automation_dead_letters` and marked `status = "failed"` in the queue.

There are 71 event types defined in `src/types/automation.ts` as the `AutomationEventType` union, covering job lifecycle, payment lifecycle, SLA management, membership events, franchise events, and intelligence-triggered events.

Retry schedule: exponential backoff with full jitter — base delay 60 seconds, cap 15 minutes. Formula: `random() * min(900_000, 60_000 * 2^(retryCount-1))`.

---

## 8. Security Architecture

- **Rate limiting:** In-memory sliding window in `src/middleware.ts`. 10 req/min for `/api/automation/emit` and `/api/payments/*`; 30 req/min for `/api/webhooks/*`; 60 req/min for all other `/api/*` routes. Rate key is `${ip}:${pathname}`.
- **Security headers:** Applied to every response by `applySecurityHeaders()` in middleware: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-XSS-Protection: 1; mode=block`.
- **Session management:** HTTP-only, Secure, SameSite=Lax cookies managed by `@supabase/ssr`. No localStorage token exposure.
- **Cron authentication:** All cron routes require `Authorization: Bearer <CRON_SECRET>` header.
- **Admin client isolation:** `getAdminClient()` (service_role key) is used only in worker processes and admin API routes, never in user-facing routes.

---

## 9. Feature Flag Gating

Post-MVP modules are compiled into the application but disabled at runtime via `FEATURE_FLAGS` in `src/lib/feature-flags.ts`. Flags are read from `NEXT_PUBLIC_FF_*` environment variables.

Gated features (default OFF):
- `NEURAL_RUNTIME` — adaptive model selection (`NEXT_PUBLIC_FF_NEURAL_RUNTIME`)
- `FEDERATION_NETWORK` — cross-franchise intelligence (`NEXT_PUBLIC_FF_FEDERATION`)
- `SWARM_COORDINATION` — distributed agent consensus (`NEXT_PUBLIC_FF_SWARM`)
- `EVOLUTION_CYCLES` — self-modifying agent policies (`NEXT_PUBLIC_FF_EVOLUTION`)
- `AUTONOMOUS_REMEDIATION` — autonomous incident response (`NEXT_PUBLIC_FF_AUTO_REMEDIATION`)
- `MEMORY_FEDERATION` — cross-tenant shared memory (`NEXT_PUBLIC_FF_MEMORY_FEDERATION`)
- `ELASTIC_SCALE` — infrastructure scaling APIs (`NEXT_PUBLIC_FF_ELASTIC_SCALE`)

MVP features (default ON, can be disabled): `AI_AGENTS`, `ENTERPRISE_INTELLIGENCE`, `DIGITAL_TWIN`, `KNOWLEDGE_GRAPH`.

---

## 10. Known Architectural Decisions and Limitations

| Decision | Rationale | Future path |
|---|---|---|
| In-memory rate limiting | No Redis in MVP environment. Acceptable for single Vercel instance. | Upstash Redis before horizontal scaling |
| In-memory circuit breakers | State resets on process restart. Acceptable for MVP. | Persist circuit state to database |
| In-memory operator state | `pauseRuntime()`, `disableAgent()` state lost on restart | Persist to a `runtime_operator_state` table |
| No CSP header | Not yet configured in Next.js config or Vercel headers | Add before high-traffic launch |
| `--legacy-peer-deps` | Stripe `@stripe/stripe-js` version conflict with peer deps | Resolve when Stripe SDK updates |
| Sequential coordinateAgents | Agents run with `Promise.all()` (parallel per batch, not sequential) | Already parallel; latency bounded by slowest agent |
| No dedicated queue broker | `automation_queue` table replaces Redis/SQS | Consider Upstash QStash for higher throughput |
