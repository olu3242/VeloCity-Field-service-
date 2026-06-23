# Operational Traceability Matrix (Part C)

Single combined view across Part A (Agent Activation) and Part B (Service Catalog), each row traced to a real source file and a real evidence path.

## Part A — Agents

| Agent | Real trigger | Real execution path | Evidence | Visibility |
|---|---|---|---|---|
| ALICE | `service_request_created` event / direct call in `api/jobs/route.ts` | `src/lib/agents/alice.ts` via `runAgent`/direct `.classify()` | `agent_logs` row per call | Command Center "AI Agent Activity" table |
| MAX | `api/admin/dispatch/route.ts` direct call | `src/lib/agents/max.ts` `.match()` | `agent_logs` row | Command Center "AI Agent Activity" table |
| QUINN | `quote_submitted`/review automation events | `src/lib/agents/quinn.ts` via `runAgent` in `api/quotes/route.ts` and automation handlers | `agent_logs` row | Command Center "AI Agent Activity" table |
| NOVA, REX, IVY, FINN, LENA, TESS, GABRIEL | Real automation event types routed by `src/lib/automation/router.ts` | Per-agent handler files in `src/lib/automation/handlers/*.ts` → `runAgent()` | `agent_logs` row (GABRIEL additionally logs an unconditional governance audit entry after every processed event) | Command Center "AI Agent Activity" table |

Full per-agent detail: see `AGENT_INVOCATION_MATRIX.md`, `AGENT_TRACEABILITY_MATRIX.md`, `AGENT_OPERATIONAL_CERTIFICATION.md`.

## Part B — Service Catalog

| Integration point | Real source | Evidence/visibility |
|---|---|---|
| Schema | `supabase/migrations/016_service_catalog.sql` | Idempotency-tested against local Postgres |
| Booking | `src/app/book/page.tsx`, `src/app/api/service-types/route.ts`, `src/app/api/jobs/route.ts` | New job rows carry `service_type_id`/`service_package_id` when selected |
| Dispatch | `src/lib/providers/getAvailableProviders.ts` | Provider eligibility narrows when capability rows exist for the job's service type |
| Pricing | `src/app/api/quotes/route.ts`, `src/lib/pricing/calculatePrice.ts` | `pricing_decisions.result.pricingResult` reflects profile-driven pricing when a profile row exists |
| Command Center | `src/app/admin/command-center/page.tsx` | "Service Catalog Revenue Breakdown" section |

Full detail: see `SERVICE_CATALOG_AUDIT.md`, `SERVICE_CATALOG_TRACEABILITY.md`, `SERVICE_CATALOG_CERTIFICATION.md`, `SERVICE_CATALOG_E2E_VALIDATION.md`.

## Cross-cutting confirmation

- No new runtime systems, orchestration systems, AI frameworks, command centers, mission-control pages, automation engines, dispatch engines, pricing engines, or reporting engines were created in this batch.
- Every new artifact (4 tables, 2 FK columns, 1 API route, 1 booking step, 1 dispatch filter branch, 1 pricing branch, 1 Command Center section) traces to and extends an existing production capability.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass with the full combined diff.

**Status: Part A and Part B both certified per their respective certification documents. Part C combined traceability confirmed.**
