# Agent Operational Certification

| Agent | Trigger → Execution → Evidence → Visibility | Certified |
|---|---|---|
| ALICE | Real job-creation route + `service_request_created` event → `alice.classify` / `alice-intake` handler → `agent_logs` → Command Center table + `jobs.ai_classification` | ✅ ACTIVE |
| MAX | Dispatch route + `provider_offer_expired` (5-min cron) → `max.match` / `max-dispatch` handler → `agent_logs` → Command Center table | ✅ ACTIVE |
| QUINN | Quotes route + `quote_submitted`/`quote_approved` → `quinn.reviewQuote` / `quinn-quote` handler → `agent_logs` → Command Center table | ✅ ACTIVE |
| NOVA | Job transition route + `job_state_changed`/`job_completed` → `nova-workflow` handler → `agent_logs` → Command Center table + `job_status_history` | ✅ ACTIVE |
| REX | Reviews route + `provider_scoring_due` (daily cron) → `rex-completion` handler → `agent_logs` → Command Center table + `providers.trust_score` | ✅ ACTIVE |
| IVY | Disputes route + `dispute_opened` → `ivy-dispute` handler → `agent_logs` → Command Center table + disputes KPI | ✅ ACTIVE |
| FINN | `payout_queued`/`failed_payment_retry` (5-min cron) → `finn-payment` handler → `agent_logs` → Command Center table + `payout_ledger`/`refund_records` KPIs | ✅ ACTIVE |
| LENA | `retention_campaign_due` (daily cron) → `lena-retention` handler → `agent_logs` → Command Center table | ✅ ACTIVE |
| TESS | `daily_territory_analysis` (daily cron) → `tess-territory` handler → `agent_logs` → Command Center table + Territory Expansion card | ✅ ACTIVE |
| GABRIEL | Every automation event (universal audit) + provider onboarding routes → `gabriel.screenProvider` + router's unconditional governance log → `agent_logs`/`audit_logs` → Command Center table + provider approval responses | ✅ ACTIVE |

## Acceptance criteria (Part A of the batch)

- ✅ All 10 agents operational — confirmed via `AGENT_INVOCATION_MATRIX.md`
- ✅ All agents generate evidence — `agent_logs`, written automatically by `BaseAgent.run()` for every call
- ✅ All agents visible in Command Center — `src/app/admin/command-center/page.tsx`, extended "AI Agent Activity" table
- ✅ No duplicate logging/evidence framework introduced
- ✅ No duplicate dashboard introduced
- ✅ Build, lint, typecheck pass (verified after the Command Center change)

Part A of the Operational Convergence Batch is certified complete.
