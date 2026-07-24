# Event Fabric Standard

## Overview

The Event Fabric is the event-driven communication layer of the Workstream Execution Fabric. It publishes structured lifecycle events to the `system_events` table at every significant point in the execution pipeline.

Source: `src/lib/execution/event-fabric.ts`

---

## Design Principles

1. **Non-fatal**: All event publishing is wrapped in try-catch. A database failure during event publication never halts execution.
2. **Append-only**: Events are written once and never modified.
3. **Tenant-scoped**: Every event carries `tenantId` and `correlationId` from the `ExecutionContext`.
4. **WEF-owned**: WEF events go to `system_events` with typed `event_type` values. They do not share the `automation_queue` with the Automation Engine.
5. **Typed**: All 20 event types are defined in `WEFEventType` and have corresponding typed publisher functions.

---

## Event Types

```typescript
type WEFEventType =
  // Core execution lifecycle
  | "execution.started"
  | "execution.planning"
  | "execution.graph.generated"
  | "execution.node.started"
  | "execution.node.completed"
  | "execution.node.failed"
  | "execution.node.retried"
  | "execution.node.skipped"
  | "execution.recovered"
  | "execution.completed"
  | "execution.failed"
  | "execution.degraded"
  // AI planning
  | "ai.plan.requested"
  | "ai.plan.completed"
  // Knowledge graph
  | "knowledge.retrieved"
  // Digital twin
  | "simulation.run"
  | "simulation.passed"
  | "simulation.blocked"
  // Governance
  | "policy.evaluated"
  // Learning
  | "learning.cycle.completed";
```

Two additional internal types are used for observability but are not in `WEFEventType`:
- `"execution.trace"` — full execution trace written after completion
- `"execution.metrics"` — aggregated metrics written by the learning module

---

## Event Shape

```typescript
interface WEFEvent {
  executionId: string;      // from ExecutionContext
  correlationId: string;    // from ExecutionContext
  traceId: string;          // from ExecutionContext
  tenantId: string | null;
  workstream: string;
  workflow: string;
  type: WEFEventType;
  payload: Record<string, unknown>;
  timestamp: string;        // ISO 8601
}
```

Written to `system_events` as:
```sql
INSERT INTO system_events (event_type, tenant_id, payload, created_at)
VALUES ($type, $tenantId, $payload::jsonb, $timestamp)
```

The full `WEFEvent` object is the `payload`.

---

## Publisher Functions

Each event type has a typed publisher that constructs and publishes the event:

| Function | Event Type | Key Payload Fields |
|----------|-----------|-------------------|
| `publishExecutionStarted` | `execution.started` | `workstream`, `workflow`, `intent` |
| `publishExecutionPlanning` | `execution.planning` | `workstream`, `workflow` |
| `publishGraphGenerated` | `execution.graph.generated` | `nodeCount`, `edgeCount`, `criticalPathLength` |
| `publishNodeStarted` | `execution.node.started` | `nodeId`, `nodeName`, `dependencies` |
| `publishNodeCompleted` | `execution.node.completed` | `nodeId`, `durationMs`, `retryCount` |
| `publishNodeFailed` | `execution.node.failed` | `nodeId`, `error`, `retryCount` |
| `publishNodeSkipped` | `execution.node.skipped` | `nodeId`, `reason` |
| `publishExecutionRecovered` | `execution.recovered` | `strategy`, `recoveredNodes` |
| `publishExecutionCompleted` | `execution.completed` | `durationMs`, `nodeCount`, `successRate` |
| `publishExecutionFailed` | `execution.failed` | `error`, `durationMs` |
| `publishExecutionDegraded` | `execution.degraded` | `reason` |
| `publishAIPlanRequested` | `ai.plan.requested` | `workstream`, `workflow` |
| `publishAIPlanCompleted` | `ai.plan.completed` | `riskScore`, `estimatedDurationMs`, `nodeCount` |
| `publishKnowledgeRetrieved` | `knowledge.retrieved` | `entityType`, `nodeCount` |
| `publishSimulationRun` | `simulation.run` | `confidence`, `passed`, `recommendation` |
| `publishPolicyEvaluated` | `policy.evaluated` | `allowed`, `reason`, `appliedRules` |
| `publishLearningCycleCompleted` | `learning.cycle.completed` | `executionsAnalyzed` |

---

## Error Handling

All publishers follow this pattern:

```typescript
async function publishWEFEvent(event: WEFEvent): Promise<void> {
  try {
    await getAdminClient()
      .from("system_events")
      .insert({ event_type: event.type, tenant_id: event.tenantId, payload: event });
  } catch (err) {
    console.warn("[WEF] event publish failed", event.type, err);
  }
}
```

A warning is emitted but execution continues.

---

## Querying Events

The Event Fabric stores events in `system_events`. The Command Center API queries them with standard filters:

```sql
-- Recent execution events for a tenant
SELECT * FROM system_events
WHERE event_type LIKE 'execution.%'
  AND payload->>'tenantId' = $tenantId
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Filter by correlation
SELECT * FROM system_events
WHERE payload->>'correlationId' = $correlationId;

-- AI planning decisions
SELECT * FROM system_events
WHERE event_type LIKE 'ai.%'
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## Separation from Automation Engine

The Automation Engine uses `automation_queue` and `automation_runs` tables with its own `AutomationEventType` values. The WEF does not write to `automation_queue` and does not interfere with automation rule processing.

Both systems coexist in `system_events` but are distinguished by their `event_type` namespace:
- `execution.*` — WEF lifecycle events
- `ai.*` — WEF AI planning events
- `simulation.*` — WEF digital twin events
- `knowledge.*` — WEF knowledge graph events
- `policy.*` — WEF governance events
- `learning.*` — WEF continuous learning events
- `booking_*`, `payment_*`, etc. — Automation Engine events (existing)
