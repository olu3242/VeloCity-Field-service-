# VeloCity Enterprise Compliance

## Compliance Framework

VeloCity's compliance infrastructure ensures operational traceability, audit completeness, tenant isolation, and governance accountability across all AI and automation activity.

---

## Audit Trail Architecture

### Three-Layer Audit System

| Layer | Table | What It Captures |
|---|---|---|
| Agent execution | `agent_logs` | Every AI call: agent, input, output, tokens, latency, trace_id |
| Governance events | `audit_logs` | Every automation event processed (GABRIEL); all operator actions |
| Automation runs | `automation_runs` | Full execution chain: queue → worker → handler → result |

### Completeness Guarantees

- Every event through `routeAutomationEvent()` → GABRIEL inserts to `agent_logs`
- Every handler error → `audit_logs` with `action: "handler_error:{event_type}"`
- Every operator action (pause, resume, disable, override) → `audit_logs` with `actor_id`
- Every queue item → `automation_runs` record with start/end/status

### Query Patterns

```sql
-- Full audit trail for a job
SELECT action, actor_id, metadata, created_at FROM audit_logs
WHERE metadata->>'job_id' = $1 OR entity_id = $1
ORDER BY created_at;

-- All operator actions this week
SELECT action, actor_id, metadata, created_at FROM audit_logs
WHERE action LIKE 'operator:%'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- AI decisions for a dispute
SELECT agent_name, output->'data'->'recommendation', output->'data'->'confidence', created_at
FROM agent_logs
WHERE job_id = $1 AND agent_name = 'IVY'
ORDER BY created_at;
```

---

## Tenant Isolation Compliance

Multi-tenant isolation is enforced at three levels:

1. **Database (Supabase RLS):** Row-level policies on all tables enforce `tenant_id` filtering. Service role bypasses RLS only for automation workers.

2. **Application (`assertTenantIsolation`):** Every cross-resource access is checked against the requesting tenant's ID.

3. **AI Context (`hydrateContext`):** All Supabase queries in context hydration include `.eq("tenant_id", tenantId)` — no cross-tenant data leaks into agent prompts.

---

## Replay Safety

Event replay is safe because:
- `dedup_key` unique constraint prevents duplicate DB inserts (60s window)
- In-memory `checkDuplication()` provides 30s fast-path dedup
- `automation_runs` records the execution chain — replayed events create new run records, not overwriting old ones

Replay should only be used for failed/stuck events. Admin who replays a successfully-processed event accepts responsibility for potential duplicate side effects.

---

## Data Retention

| Data | Retention | Notes |
|---|---|---|
| `agent_logs` | 90 days (recommended) | Compress/archive after 30 days |
| `audit_logs` | 2 years (regulatory) | Never delete |
| `automation_events` | 90 days | |
| `automation_runs` | 90 days | |
| `automation_queue` | 30 days after completion | |

Retention enforcement via Supabase scheduled jobs (roadmap).

---

## GDPR / Privacy Considerations

- Customer PII (email, phone, address) stored only in `profiles` and `jobs` tables
- Agent prompts include job details but should not include raw PII beyond what's operationally necessary
- AI output stored in `agent_logs.output` — review for PII before extended retention
- Right-to-erasure implementation: cascading deletes via `customer_id` FK (roadmap)

---

## SOC 2 Readiness Checklist

### Availability
- [x] Queue worker with retry and dead-letter handling
- [x] Circuit breakers prevent cascade failures
- [x] Runtime pause/resume without data loss
- [ ] Multi-region worker deployment

### Confidentiality
- [x] Supabase RLS on all tables
- [x] Tenant isolation enforced at application layer
- [x] Admin role required for all `/api/admin/*` routes
- [ ] API rate limiting per user/IP

### Integrity
- [x] Full audit trail for all automation events
- [x] Operator actions audit-logged with actor_id
- [x] AI decisions recorded with reasoning
- [x] Event deduplication prevents double-processing

### Processing Integrity
- [x] Input validation (Zod) at all API boundaries
- [x] Handler errors caught and logged (not silently dropped)
- [x] Governance policies enforced before execution

### Privacy
- [ ] GDPR data export flow
- [ ] Right-to-erasure implementation
- [ ] PII audit of agent_logs.output
