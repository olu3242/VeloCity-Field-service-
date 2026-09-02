# Enterprise Command Center

## Overview

The Enterprise Command Center is the real-time operational visibility layer for the Workstream Execution Fabric. It provides administrators with a unified view of execution health, AI planning activity, workstream performance, and platform dependencies.

Routes:
- **UI**: `/admin/execution` — Server-rendered dashboard
- **API**: `/api/admin/execution` — JSON endpoint consumed by the UI

---

## Access Control

Both the UI and API require an authenticated session with `role: "admin"` or `role: "super_admin"`. Other roles receive a 403.

---

## API Endpoint

### `GET /api/admin/execution`

Query parameters:
- `?correlation=<id>` — filter events and traces by `correlationId`
- `?workstream=<id>` — filter metrics by workstream

Response shape:

```typescript
{
  fabricHealth: FabricHealthSnapshot;
  platformHealth: PlatformHealthReport;
  traces: ExecutionTrace[];          // last 20 execution traces
  recentEvents: RecentEvent[];       // last 50 WEF events
  workstreamSummary: WorkstreamSummary[];
  generatedAt: string;               // ISO 8601
}
```

#### FabricHealthSnapshot

```typescript
{
  activeCircuits: number;
  openCircuits: number;
  fabricHealth: "healthy" | "degraded" | "offline";
  checkedAt: string;
}
```

- `"healthy"`: no open circuits
- `"degraded"`: 1 or more open circuits
- `"offline"`: more than 50% of circuits are open

#### WorkstreamSummary

Aggregated from `execution.metrics` events in the past 24 hours, grouped by `workstream`:

```typescript
{
  workstream: string;
  executions: number;
  successful: number;
  failed: number;
  avgDurationMs: number;
  totalRetries: number;
}
```

---

## Dashboard Sections

### Health Banner

Full-width status indicator at the top of the page:
- **Green**: Fabric healthy, all systems operational
- **Yellow**: Degraded — open circuits or platform dependencies in warning state
- **Red**: Offline — majority of circuits open or critical dependency failures

### KPI Cards (4 cards)

| Card | Data source |
|------|------------|
| Executions (24h) | Count of `execution.trace` events |
| Success Rate | Ratio of completed to total traces |
| Avg Duration | Mean `durationMs` from traces |
| AI Plans | Count of `ai.plan.completed` events |

### Workstream Execution Matrix

Table showing per-workstream performance over the past 24 hours:
- Workstream name
- Total executions
- Success / Failed counts
- Average duration (ms)
- Retry count
- AI plan usage flag

### Recent Executions Table

The 20 most recent execution traces, showing:
- Status badge (completed / failed / degraded)
- Workstream and workflow
- Intent (truncated)
- Duration
- Node count
- AI plan used (Y/N)
- Correlation ID (click to filter)

### AI Planning Decisions

Panel showing the most recent `ai.plan.completed` events with:
- Workflow name
- Risk score (color-coded)
- Estimated duration
- Node count in generated plan

### Live Event Stream

The 30 most recent WEF events in reverse chronological order:
- Event type
- Workstream / workflow
- Timestamp
- Key payload fields

### Platform Dependencies

Grid of platform dependency health from `aggregatePlatformHealth`:
- Dependency name and category
- Health status badge
- Whether the dependency is marked critical

### Infrastructure Stats

Three-column row:
- Queue stats (automation queue depth)
- Worker stats (active workstreams)
- Circuit Breaker summary (open/closed counts)

---

## Server Component Architecture

`/admin/execution/page.tsx` is a Next.js 14 server component:

```typescript
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
```

`force-dynamic` ensures the page is never cached — it always fetches live data on each request. The page calls `/api/admin/execution` directly via `fetch` with the current session cookie forwarded.

Data fetching failures result in a degraded UI state (error banner) rather than a 500 error page.

---

## Refresh

The dashboard does not auto-refresh. Administrators reload the page to see updated data. The `generatedAt` timestamp in the top-right corner shows when the current snapshot was taken.

A future enhancement can add streaming via Server-Sent Events once the platform's realtime infrastructure matures.

---

## Navigation

The Command Center is linked from the main admin navigation under **System** → **Execution Fabric**. It is visible only to users with `admin` or `super_admin` roles.
