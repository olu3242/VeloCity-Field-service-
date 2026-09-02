# Automation Fabric Certification (Platform Certification Batch, Phase 4)

| Criterion | Status | Evidence |
|---|---|---|
| Event routing | ✅ | `routeAutomationEvent()` (`src/lib/automation/router.ts:46-286`) is a single switch-dispatch over 68 typed event types to 13 hardcoded handler imports; default case logs an unhandled-event audit row rather than silently dropping the event |
| Retry logic | ✅ (linear, not exponential) | `worker.ts` increments `automation_queue.retry_count` and sets `available_at = now + retryCount * 60s` on failure; after 3 attempts status becomes `failed`. **Disclosed gap**: backoff is linear (1/2/3 min), not exponential — see `KNOWN_LIMITATIONS.md` |
| Cron execution | ✅ | 2 Vercel crons in `vercel.json` (`/api/cron/automation` every 5 min, `/api/cron/daily-intelligence` daily) plus 2 additional cron routes reachable by external scheduler/manual trigger (`/api/cron/sla`, `/api/cron/payouts`); each authenticated via `CRON_SECRET` bearer/header check |
| Workflow execution | ✅ (choreography, not orchestration) | No DAG/workflow engine exists; each handler emits the next event via `emitEvent()`, forming an event-chain (e.g. `service_request_created` → `serviceability_passed` → `provider_offer_sent` → `job_accepted` → … → `job_completed`). `automation_runs` records actions/output/duration per processed item |
| Failure recovery | ✅ (manual, no DLQ table) | Items exhausting retries are marked `status='failed'` and remain queryable in `automation_queue` indefinitely (implicit dead-letter, no separate table); `/admin/automation` surfaces a red banner with a "Retry Now" button calling `POST /api/admin/automation/process`; no automatic email/Slack alerting exists |
| Deduplication | ✅ | `emitEvent()` checks `dedup_key` before inserting, preventing duplicate queue entries for the same logical event |
| Governance audit | ✅ | Every processed event, regardless of handler outcome, gets a GABRIEL `agent_logs` row (`router.ts:272-282`) — this is the platform-wide automation audit trail |
| Command Center visibility | ✅ | `/admin/command-center` queries `automation_queue` (status, retry_count, error_message) directly; `/admin/automation` and `/admin/automation/logs` provide deeper queue/event/run/agent-log visibility |

## Disclosed gaps (carried to Risk Register / Known Limitations)

- Backoff is linear (1, 2, 3 minutes), not exponential as commonly expected for production queues.
- No dedicated dead-letter table — failed items live in `automation_queue` with `status='failed'`, distinguishable only by that status field.
- No circuit breaker — a systemically failing handler (e.g. a third-party API outage) will retry every queued item independently up to 3 times rather than backing off the whole handler class.
- No automated alerting (email/Slack/PagerDuty) on failure spikes — admins must visit `/admin/automation` to notice.
- Handler dispatch is a hardcoded switch/import list, not a dynamic registry — adding a new event type requires a code change to `router.ts`, which is acceptable for the platform's current scale but worth noting for extensibility.

**Status: CERTIFIED ✅** — the automation fabric reliably routes, retries, and audits every event with full Command Center visibility; the gaps above are real but are operational-maturity gaps, not correctness gaps, and do not block this certification.
