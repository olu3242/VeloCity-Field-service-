# Workstream Execution Fabric — Architecture

## Overview

The Workstream Execution Fabric (WEF) is the central orchestration layer of the VeloCity Field Service platform. Every business operation — dispatch, payments, customer management, franchise operations — executes through a unified 16-stage pipeline that enforces governance, AI planning, knowledge retrieval, digital twin simulation, autonomous recovery, and continuous learning.

The WEF sits above the Workstream Reliability Framework (WRF) and consumes its health and circuit-breaker infrastructure as policy inputs.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Enterprise Command Center                         │
│                  /admin/execution  (real-time)                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                 Universal Execution Engine                            │
│          src/lib/execution/engine.ts — 16-stage pipeline            │
│                                                                      │
│  1. Intent → 2. Policy → 3. Identity → 4. Tenant → 5. Context      │
│  6. Knowledge → 7. AI Planning → 8. Graph → 9. Simulation           │
│  10. Dependencies → 11. Execution → 12. Recovery →                  │
│  13. Persistence → 14. Events → 15. Telemetry → 16. Learning        │
└──┬──────────┬──────────┬──────────┬──────────────┬──────────────────┘
   │          │          │          │              │
   ▼          ▼          ▼          ▼              ▼
┌──────┐ ┌───────┐ ┌─────────┐ ┌───────────┐ ┌────────────┐
│ DAG  │ │  AI   │ │Knowledge│ │  Digital  │ │ Autonomous │
│Graph │ │Planner│ │  Graph  │ │   Twin    │ │  Recovery  │
│Engine│ │       │ │         │ │Simulation │ │            │
└──┬───┘ └───────┘ └─────────┘ └───────────┘ └────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Event Fabric                                  │
│             system_events table (WEF-owned event log)                │
└──────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 Workstream Reliability Framework (WRF)                │
│    Circuit breakers · Health aggregator · Dependency registry        │
└──────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Supabase (Postgres + RLS)                       │
│    system_events · workstream_health · jobs · providers · tenants    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Universal Execution Engine (`src/lib/execution/engine.ts`)

The single entry point for all business operations. Accepts an `ExecutionIntent` and a callback function, runs it through 16 stages, returns an `ExecutionResult<T>`.

Every stage is audited. Failures in optional stages (knowledge, planning, simulation) are non-fatal and degrade gracefully.

### Execution Graph Engine (`src/lib/execution/graph.ts`)

Converts execution plans into directed acyclic graphs (DAGs). Executes waves of parallel nodes, isolates downstream failures, computes critical paths, and tracks per-node timing.

### AI Planning Layer (`src/lib/execution/planner.ts`)

Uses `claude-haiku-4-5-20251001` to generate execution plans enriched with knowledge context and learning signals. Falls back to a single-node graph if planning is unavailable.

### Knowledge Graph Integration (`src/lib/execution/knowledge.ts`)

Retrieves entity context (jobs, customers, providers) from the platform knowledge graph before execution. Risk hints from knowledge context flow into AI planning.

### Digital Twin Simulation (`src/lib/execution/digital-twin.ts`)

For high-impact workflows, runs a pre-execution simulation against the platform's digital twin. Returns a confidence score and recommendation: `proceed`, `degrade`, or `abort`.

### Event Fabric (`src/lib/execution/event-fabric.ts`)

Publishes structured lifecycle events to the `system_events` table. All 20 WEF event types are defined and typed. Event publishing is always non-fatal.

### Autonomous Recovery (`src/lib/execution/recovery.ts`)

Graph-aware failure recovery. Analyzes the DAG to determine which branches can continue when a node fails. Strategies: `retry`, `use-cache`, `skip-node`, `degrade`, `abort`.

### Telemetry (`src/lib/execution/telemetry.ts`)

Per-node OpenTelemetry-compatible spans, flame graph generation, and execution trace persistence to `system_events`.

### Continuous Learning (`src/lib/execution/learning.ts`)

Records execution metrics after every run, aggregates signals over a rolling 24-hour window, and feeds them back into AI planning as contextual hints.

---

## Execution Flow

```
ExecutionIntent
      │
      ▼
 [Stage 1] Intent Captured — publish execution.started
      │
      ▼
 [Stage 2] Policy Evaluated — circuit breakers + tenant check
      │ (blocked → fail immediately)
      ▼
 [Stage 3–4] Identity + Tenant resolved from intent.actor
      │
      ▼
 [Stage 5] Context Assembly — learning signals from last 24h
      │
      ▼
 [Stage 6] Knowledge Graph — job/customer/provider context
      │ (failure → non-fatal, skip)
      ▼
 [Stage 7] AI Planning — generate execution DAG
      │ (failure → fallback single-node graph)
      ▼
 [Stage 8] Graph Generated — publish execution.graph.generated
      │
      ▼
 [Stage 9] Digital Twin Simulation (high-impact workflows only)
      │ abort → fail  │  degrade → continue with degraded flag
      ▼
 [Stage 10] Dependency Resolution — platform health check
      │
      ▼
 [Stage 11–12] Execution — run fn(ctx) with retry loop
      │ → recoverExecution on failure
      ▼
 [Stage 13] State Persistence (handled by fn)
      │
      ▼
 [Stage 14] Event Publication — publish execution.completed/failed
      │
      ▼
 [Stage 15] Telemetry — persist execution trace
      │
      ▼
 [Stage 16] Learning + Certification — record metrics, publish learning cycle
      │
      ▼
 ExecutionResult<T>
```

---

## Multi-Tenancy

Every `ExecutionContext` carries `tenantId` and `franchiseId` from the initiating actor. All knowledge graph queries, simulation runs, learning aggregations, and event records are tenant-scoped.

The policy stage rejects executions where `actor.tenantId` is absent (except for the `executive-intelligence` workstream).

---

## Observability

All executions produce:
- A structured `ExecutionContext` with full audit trail
- Per-node timing spans
- Events in `system_events` (type: `execution.*`, `ai.*`, `simulation.*`, `learning.*`)
- Execution traces (type: `execution.trace`)
- Metric records (type: `execution.metrics`)

The Enterprise Command Center at `/admin/execution` provides real-time visibility across all of these.

---

## File Index

| File | Purpose |
|------|---------|
| `src/lib/execution/types.ts` | Full WEF type system |
| `src/lib/execution/engine.ts` | 16-stage Universal Execution Engine |
| `src/lib/execution/graph.ts` | DAG execution engine |
| `src/lib/execution/event-fabric.ts` | Event publishing layer |
| `src/lib/execution/knowledge.ts` | Knowledge graph integration |
| `src/lib/execution/digital-twin.ts` | Digital twin simulation gate |
| `src/lib/execution/recovery.ts` | Autonomous recovery strategies |
| `src/lib/execution/telemetry.ts` | Span tracking and trace persistence |
| `src/lib/execution/planner.ts` | AI execution plan generation |
| `src/lib/execution/learning.ts` | Continuous learning and metrics |
| `src/lib/execution/index.ts` | Public API re-exports |
| `src/app/api/admin/execution/route.ts` | REST endpoint for Command Center |
| `src/app/admin/execution/page.tsx` | Enterprise Command Center UI |
| `src/__tests__/execution-fabric.test.ts` | Unit tests (29 tests) |
