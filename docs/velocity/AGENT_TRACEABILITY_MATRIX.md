# Agent Traceability Matrix

User-action-centric view (complements the agent-centric `AGENT_INVOCATION_MATRIX.md`). Each row traces a real user/system action through to the agent(s) it activates.

| User/system action | Real source | Event | Agent(s) | Evidence | Visibility |
|---|---|---|---|---|---|
| Customer books a job | `src/app/api/jobs/route.ts` | `service_request_created` | ALICE | `agent_logs`, `jobs.ai_classification` | Command Center |
| Provider offer expires unaccepted | `/api/cron/automation` (5 min) | `provider_offer_expired` | MAX | `agent_logs` | Command Center, dispatch route |
| Provider submits a quote | `src/app/api/quotes/route.ts` | `quote_submitted` | QUINN | `agent_logs`, `quotes` row | Command Center |
| Customer approves a quote | quotes route | `quote_approved` | QUINN → FINN (chained) | `agent_logs` ×2 | Command Center |
| Job status changes (en route / arrived / completed) | `src/app/api/jobs/[id]/transition/route.ts` | `job_state_changed` / `job_completed` | NOVA, REX (on completion) | `agent_logs`, `job_status_history` | Command Center |
| Customer leaves a review | `src/app/api/reviews/route.ts` | `review.submitted` (direct call) | REX | `agent_logs`, `providers.trust_score` | Provider dashboard, dispatch route, Command Center |
| Daily provider scoring sweep | `/api/cron/daily-intelligence` | `provider_scoring_due` | REX | `agent_logs` | Command Center |
| Customer opens a dispute | `src/app/api/disputes/route.ts` | `dispute_opened` | IVY | `agent_logs`, `disputes` row | Command Center, disputes KPI |
| Payment captured/escrowed | payments flow | `payout_queued` (5-min cron) | FINN | `agent_logs`, `payout_ledger` | Command Center |
| Payment fails | payments flow | `failed_payment_retry` (5-min cron) | FINN | `agent_logs` | Command Center |
| Daily retention sweep over all customers | `/api/cron/daily-intelligence` | `retention_campaign_due` | LENA | `agent_logs` | Command Center |
| Daily territory analysis | `/api/cron/daily-intelligence` | `daily_territory_analysis` | TESS | `agent_logs` | Command Center, Territory Expansion card |
| High demand/franchise-candidate area detected | `/api/cron/daily-intelligence` (conditional) | `franchise_candidate_area_detected` | TESS | `agent_logs` | Command Center, Growth dashboard |
| Provider signs up | `src/app/api/providers/route.ts` | `gabriel.screenProvider` (direct call) | GABRIEL | `agent_logs` | API response `gabriel_screen` |
| Admin approves a provider | `src/app/api/admin/providers/[id]/approve/route.ts` | `gabriel.screenProvider` (direct call) | GABRIEL | `agent_logs` | API response `gabriel_check` |
| Every automation event processed | `src/lib/automation/router.ts` (unconditional, all branches) | any | GABRIEL (universal governance audit) | `agent_logs` (`action: "Governance Audit"`) | Command Center |

This table and `AGENT_INVOCATION_MATRIX.md` are kept as two views of the same underlying real code — neither duplicates a runtime system; both are documentation artifacts over the existing `router.ts`/`agent_logs` infrastructure.
