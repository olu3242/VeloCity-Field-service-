# VeloCity Federated Runtime

## Overview

The federated runtime enables multiple AI agents and operational domains to coordinate without tight coupling. All coordination flows through the canonical event fabric — no agent communicates with another directly.

```
Agent A needs Agent B
       ↓
delegateTask(from: A, to: B, taskType: "escalate", payload)
       ↓
Validation (both agents active in AGENT_REGISTRY)
       ↓
emitEvent("agent_run", { delegation_id, from, to, ... })
       ↓
automation_queue → worker → router → handler
       ↓
Agent B executes via dispatchAgent()
       ↓
Result logged to agent_logs (trace_id propagated)
```

---

## Federation Layer (`src/lib/federation/`)

| File | Responsibility |
|---|---|
| `coordinator.ts` | Task delegation between agents |
| `capability-discovery.ts` | Dynamic capability registry |
| `prioritization.ts` | SLA-aware execution ranking |

---

## Coordinator

`delegateTask(request: DelegationRequest)` validates both agents, emits an event, and returns a `DelegationResult` immediately. Execution is asynchronous — the event enters the queue and processes on the next worker cycle.

Delegation task types:
- `escalate` — hand off a critical issue to a higher-authority agent
- `handoff` — transfer ongoing workflow to another domain agent
- `consult` — request analysis from a specialist agent (IVY, REX, FINN)
- `notify` — inform another agent of a state change
- `coordinate` — multi-agent parallel coordination

All delegations are observable: `getDelegation(id)` and `getActiveDelegations()` provide runtime visibility.

---

## Capability Discovery

`discoverCapabilities()` returns all active agents from `AGENT_REGISTRY` as `RuntimeCapability` objects. Status overrides (e.g., "degraded") can be applied at runtime by the circuit breaker or operator controls without modifying the registry.

`findCapableAgent(eventType)` → first available agent supporting that event type.

When a circuit breaker opens for an agent, `markCapabilityDegraded(agentName, reason)` signals downstream systems that the agent is degraded but not fully offline.

---

## Execution Prioritization

`calculatePriority(item: QueueItem)` produces a `PriorityScore` with four components:

| Component | Max | Trigger |
|---|---|---|
| Base score | 90 | Event type (disputes/chargebacks = 90, territory analysis = 20) |
| SLA boost | +20 | SLA breach within 30 minutes |
| Urgency boost | +15 | "emergency" urgency, +8 for "same_day" |
| Retry boost | +30 | +10 per retry_count |

`sortByPriority(items)` reorders a queue batch so critical events are processed first, regardless of insertion order.

---

## Federation Principles

1. **No direct agent-to-agent calls** — all delegation flows through events
2. **All delegations observable** — delegation IDs link to event + agent_logs records
3. **Governance enforced** — operator pause and circuit breakers apply to all federated execution
4. **Tenant-safe** — context and events carry tenant_id throughout the delegation chain
5. **Replay-safe** — delegations are event-backed; replaying the event re-runs the delegation

---

## Multi-Domain Coordination Map

| Source Domain | Delegates To | Task Type | Trigger |
|---|---|---|---|
| IVY (dispute) | FINN (finance) | consult | Refund calculation needed |
| IVY (dispute) | GABRIEL (governance) | notify | Fraud signal detected |
| MAX (dispatch) | TESS (territory) | consult | No providers available |
| FINN (finance) | GABRIEL (governance) | escalate | Chargeback threshold exceeded |
| LENA (retention) | QUINN (quote) | consult | Rebooking price estimation |
| REX (quality) | GABRIEL (governance) | notify | Provider suspension recommended |
| NOVA (workflow) | MAX (dispatch) | coordinate | Job reassignment needed |
