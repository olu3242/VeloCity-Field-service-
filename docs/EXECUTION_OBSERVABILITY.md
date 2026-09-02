# Execution Observability

## Overview

Every execution through the WEF produces a complete observability record: per-node timing spans, a flame graph, lifecycle events, and a persisted execution trace. All records are queryable via the Enterprise Command Center API.

Source: `src/lib/execution/telemetry.ts`

---

## Telemetry Structure

```typescript
interface ExecutionTelemetry {
  spans: TelemetrySpan[];
  totalDurationMs: number;
  successRate: number;         // 0–1
  retryCount: number;          // total retries across all nodes
  dependencyLatencies: Record<string, number>;
}
```

### TelemetrySpan

```typescript
interface TelemetrySpan {
  spanId: string;       // UUID
  name: string;         // human-readable label
  nodeId?: string;      // execution node this span belongs to
  startedAt: string;    // ISO 8601
  endedAt?: string;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  attributes: Record<string, unknown>;
}
```

---

## Telemetry API

### `createTelemetry(): ExecutionTelemetry`

Returns a fresh telemetry object with empty spans, zero counters.

### `recordSpanStart(telemetry, name, nodeId?, attributes?): string`

Starts a new span and returns its `spanId`. The span is added to `telemetry.spans` with `status: "running"`.

### `recordSpanEnd(telemetry, spanId, status, extraAttributes?)`

Closes the span, sets `endedAt`, computes `durationMs`. Status is `"completed"` or `"failed"`.

### `recordNodeTelemetry(telemetry, node)`

Called after each node completes or fails. Updates `successRate` based on current node states, appends node timing to spans.

### `finalizetelemetry(telemetry, startedAt)`

Computes `totalDurationMs` from `startedAt` to now. Called after execution completes, before persisting the trace.

Note: the function name uses a lowercase `t` — `finalizetelemetry` — matching the source implementation.

### `generateFlameGraph(telemetry): FlameNode[]`

Converts spans into a flame graph structure for visualization:

```typescript
interface FlameNode {
  name: string;
  value: number;      // durationMs
  children: FlameNode[];
  status: string;
}
```

### `persistExecutionTrace(ctx): Promise<void>`

Writes the full `ExecutionContext` as an `execution.trace` event to `system_events`. The trace payload includes the full context, all audit records, the telemetry object, and the graph's final state.

---

## Audit Trail

Every stage of execution appends an audit record to `ctx.audit`:

```typescript
interface AuditEntry {
  timestamp: string;
  stage: string;
  actor: string;    // ctx.actor.id
  action: string;
  outcome: "success" | "failure" | "skipped";
  metadata: Record<string, unknown>;
}
```

Typical audit stages in order:
1. `intent` / `captured`
2. `policy` / `evaluated`
3. `identity` / `resolved`
4. `tenant` / `resolved`
5. `context` / `assembled`
6. `knowledge` / `retrieved`
7. `planning` / `generated`
8. `graph` / `generated`
9. `simulation` / `evaluated`
10. `dependencies` / `resolved`
11. `execution` / `retry-N` (if retries occur)
12. `persist` / `completed`
13. `events` / `published`
14. `telemetry` / `persisted`
15. `learning` / `recorded`

The audit trail is returned in `ExecutionResult.context.audit` for callers that need it.

---

## Execution Trace

After every execution (success or failure), `persistExecutionTrace` writes a record to `system_events`:

```json
{
  "event_type": "execution.trace",
  "tenant_id": "<tenantId>",
  "payload": {
    "executionId": "...",
    "correlationId": "...",
    "workstream": "dispatch",
    "workflow": "provider-assignment",
    "status": "completed",
    "durationMs": 1234,
    "audit": [...],
    "telemetry": { "spans": [...], "totalDurationMs": 1234, ... },
    "graph": { "nodes": [...], ... }
  }
}
```

---

## Metrics Record

The learning module writes a metrics record after every execution:

```json
{
  "event_type": "execution.metrics",
  "tenant_id": "<tenantId>",
  "payload": {
    "executionId": "...",
    "workstream": "dispatch",
    "workflow": "provider-assignment",
    "durationMs": 1234,
    "success": true,
    "retryCount": 0,
    "nodeCount": 3,
    "planUsed": true
  }
}
```

These records are aggregated by the learning system over rolling 24-hour windows.

---

## Querying Observability Data

The Command Center API (`/api/admin/execution`) exposes:

| Data | Source query |
|------|-------------|
| Execution traces | `system_events WHERE event_type = 'execution.trace'` |
| Recent events | `system_events WHERE event_type LIKE 'execution.%'` |
| AI planning decisions | `system_events WHERE event_type LIKE 'ai.%'` |
| Workstream metrics | `system_events WHERE event_type = 'execution.metrics'` |

All queries are scoped to the past 24 hours by default. The API supports `?correlation=` and `?workstream=` query parameters for drill-down.

---

## Correlation IDs

Every execution has three IDs for distributed tracing:

| ID | Purpose |
|----|---------|
| `executionId` | Unique to this execution instance |
| `correlationId` | Groups related executions (e.g., retries, workflow chains) |
| `traceId` | End-to-end trace across service boundaries |
| `causationId` | (optional) The execution that caused this one |

All IDs are UUIDs generated via `generateRequestId()` from `src/lib/tracing/span.ts`.
