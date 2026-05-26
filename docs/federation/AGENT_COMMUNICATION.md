# VeloCity Agent Communication Fabric

## Communication Model

All agent-to-agent communication in VeloCity is **event-mediated** — no agent holds a reference to another agent instance or calls another agent's methods directly.

```
Communication flow:
Agent A → delegateTask() → emitEvent() → queue → worker → handler → Agent B
                                                                        ↓
                                                               result in agent_logs
```

This ensures:
- Every inter-agent communication is observable
- Communications are replayable
- Governance policies apply uniformly
- No hidden orchestration paths exist

---

## Communication Types

### Escalation
Agent escalates a situation beyond its own decision authority.

**Example:** IVY receives a dispute but detects potential fraud — escalates to GABRIEL.

```typescript
await delegateTask({
  fromAgent: "IVY",
  toAgent: "GABRIEL",
  taskType: "escalate",
  payload: { dispute_id, fraud_signals, confidence },
  context: { tenantId, jobId, traceId },
  priority: "critical",
  traceId: "trace-IVY-..."
});
```

### Handoff
Agent transfers workflow ownership to another domain agent.

**Example:** NOVA completes job workflow → hands off to FINN for payment processing.

### Consult
Agent requests analysis from a specialist without transferring control.

**Example:** MAX asks TESS about territory demand before dispatch decisions.

### Notify
Agent informs another of a state change requiring no response.

**Example:** REX notifies GABRIEL of provider trust score drop below threshold.

### Coordinate
Multiple agents collaborate on a shared operation.

**Example:** FINN + REX coordinate on payout release — FINN handles payment, REX updates trust.

---

## Shared Context Protocol

When delegating, context propagates through:

1. `traceId` — links all agent_logs records in a delegation chain
2. `payload` — carries domain-specific data (job_id, dispute_id, amounts, etc.)
3. `tenantId` — enforced at every hop via `assertTenantIsolation()`

Agents accessing shared state via `getContext()` from the mesh context engine must specify `tenantId` and `requestingAgent` — isolation is enforced at retrieval.

---

## Observable Communication

Every delegation creates:
1. A `DelegationResult` record in coordinator's in-memory map
2. An `agent_run` event in `automation_events`
3. An `automation_queue` entry
4. An `agent_logs` entry when the target agent executes
5. A GABRIEL governance audit record

Operators can inspect active delegations at `GET /api/admin/runtime`.

---

## Audit Trail

For every inter-agent communication:

```sql
-- Find all delegations for a job
SELECT * FROM agent_logs
WHERE job_id = $1
  AND input::jsonb ? 'delegation_id'
ORDER BY created_at;

-- Trace a delegation chain
SELECT * FROM agent_logs
WHERE input->>'trace_id' = $trace_id
ORDER BY created_at;
```

---

## Communication Governance

All inter-agent communication is subject to:
- **Operator pause** — `isRuntimePaused()` checked before delegation executes
- **Agent disable** — `isAgentEnabled(toAgent)` checked
- **Circuit breaker** — if target agent's circuit is open, delegation fails gracefully
- **Rate limit** — flood protection applies to delegation events same as any event

Failed delegations are recorded in the coordinator's in-memory map with `status: "failed"` and logged to `audit_logs`.
