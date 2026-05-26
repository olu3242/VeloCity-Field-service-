# VeloCity Global Operations Graph

## Overview

The operations graph (`src/lib/ops-graph/graph.ts`) is a runtime intelligence layer that tracks relationships between platform entities — jobs, disputes, providers, customers, payouts, workflows, and agents.

Unlike the database (which stores records), the graph models **semantic relationships** that span multiple tables and enable cross-entity intelligence.

---

## Graph Model

### Nodes

| NodeType | Represents | Example |
|---|---|---|
| `provider` | Service provider | Provider "Plumbing Pro LLC" |
| `customer` | End customer | Customer who submitted the job |
| `job` | Service job | Job ID abc-123 |
| `dispute` | Dispute record | Dispute raised on job abc-123 |
| `payout` | Payout transaction | $450 payout to provider |
| `workflow` | Workflow execution | Dispute resolution workflow run |
| `agent` | AI agent action | IVY recommendation for dispute |
| `automation` | Automation event | `dispute_opened` event |

### Edges

| EdgeType | Meaning |
|---|---|
| `resolved_by` | Dispute resolved by agent/operator |
| `triggered_by` | Event/workflow triggered by another |
| `assigned_to` | Job assigned to provider |
| `related_to` | General semantic relationship |
| `escalated_to` | Escalation path |
| `paid_via` | Payment relationship |
| `disputed_by` | Customer disputed job/payment |
| `processed_by` | Handler/agent that processed an entity |

---

## Usage

```typescript
import { GLOBAL_GRAPH } from "@/lib/ops-graph";

// Add a job node
const jobNode = GLOBAL_GRAPH.addNode({
  id: job.id,
  type: "job",
  label: job.title,
  attributes: { status: job.status, category: job.category },
});

// Add a dispute node + link it to the job
const disputeNode = GLOBAL_GRAPH.addNode({
  id: dispute.id,
  type: "dispute",
  label: `Dispute: ${dispute.reason}`,
  attributes: { reason: dispute.reason },
});

GLOBAL_GRAPH.addEdge({
  from: dispute.id,
  to: job.id,
  type: "related_to",
  weight: 1.0,
  metadata: { opened_at: dispute.created_at },
});

// Find all entities related to a job
const related = GLOBAL_GRAPH.getRelated(job.id);

// Get subgraph (depth 2 = job + all connected entities)
const subgraph = GLOBAL_GRAPH.getSubgraph(job.id, 2);
```

---

## Operational Patterns Identified by Graph

The graph enables queries that span the traditional relational model:

**Provider risk clusters:** Find providers connected to multiple dispute nodes → flag for REX review.

**Cascade failure detection:** Find automation events all triggered by a single upstream event → identify root cause.

**Customer journey mapping:** Trace customer → jobs → disputes → retention campaigns → rebooking.

**Agent decision chains:** Trace IVY recommendation → approval decision → payout release → REX trust update.

---

## Self-Healing Integration (`src/lib/ops-graph/self-healing.ts`)

The self-healing system uses the graph + governance layer to perform controlled recovery:

| Trigger | Action | Reversible? |
|---|---|---|
| Circuit breaker opens | Log reset recommendation | Yes |
| Queue item failure > 10 | Log handler pause recommendation | Yes |
| Runtime paused > 10 min | Log warning to ops team | N/A |
| Stuck workflow detected | `recover_stuck_workflow` action | Yes |

All healing actions are recorded in `HealingAction` objects and can be overridden by operators via `overrideHealing(id, adminId)`.

**Principle:** Self-healing recommends and executes safe, reversible actions. It never auto-resumes a paused runtime or auto-resolves disputes. Human operators retain final authority.

---

## Knowledge Layer (`src/lib/ops-graph/knowledge.ts`)

Alongside the graph, the knowledge layer records `OperationalPattern` objects:

```typescript
recordPattern({
  type: "anomaly",
  description: "Dispute rate spike in HVAC category",
  confidence: 0.85,
  occurrences: 3,
  data: { category: "hvac", period: "2025-Q2" },
});
```

Pattern types: `anomaly | workflow_optimization | escalation_pattern | seasonal | risk_correlation`

`findSimilarPatterns(type, minConfidence)` retrieves patterns for operational learning and AI context enrichment.
