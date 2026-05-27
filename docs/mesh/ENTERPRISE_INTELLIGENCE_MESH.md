# VeloCity Enterprise Intelligence Mesh

## What Is the Intelligence Mesh?

The intelligence mesh (`src/lib/mesh/knowledge-graph.ts`) extends the operations graph with semantic, weighted relationships across the full platform — entities, workflows, escalations, anomalies, AI decisions, operators, and business outcomes.

Where the operations graph tracks factual relationships ("job disputed_by customer"), the intelligence mesh tracks **influence relationships** ("escalation influenced dispute outcome by strength 0.85").

---

## Mesh Architecture

```
Traditional DB (facts)
    → Operations Graph (structural relationships)
        → Intelligence Mesh (semantic influence network)
```

### Mesh Nodes

| NodeType | Example |
|---|---|
| `entity` | Provider, Customer, Job (domain objects) |
| `workflow` | "dispute-resolution-v1 run #342" |
| `escalation` | "IVY escalated to GABRIEL on dispute-abc" |
| `anomaly` | "Payment failure cluster 2025-Q2" |
| `decision` | "IVY recommended refund_customer" |
| `operator` | "Admin admin@velocity.com" |
| `integration` | "Stripe payment_intent.succeeded" |
| `outcome` | "Dispute resolved — customer refunded $450" |

### Mesh Edges

Relationship types in the mesh:
- `influences` — A had impact on B's behavior/outcome
- `caused_by` — B was directly caused by A
- `resolved_by` — A resolved B
- `triggered` — A triggered B
- `learned_from` — A's behavior was informed by B
- `processed_by` — A was processed by B

`getInfluenceScore(nodeId)` — sum of incoming edge strengths (0-1) — measures how much a node drives system behavior.

`getHighWeightNodes(minWeight)` — identifies the most structurally important nodes in the mesh.

---

## Cross-System Context Engine (`mesh/context-engine.ts`)

The context engine enables safe, permissioned data sharing between agents and systems.

```typescript
// IVY shares analysis context with FINN for payout decisions
const ctx = shareContext({
  tenantId,
  domain: "dispute",
  entityId: dispute.id,
  data: {
    ivy_recommendation: "refund_customer",
    confidence: 0.87,
    refund_amount_cents: 45000,
  },
  accessibleBy: ["FINN", "GABRIEL", "admin"],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
});

// FINN retrieves shared context
const disputeCtx = getContext(ctx.contextId, "FINN", tenantId);
```

### Access Control

- `accessibleBy: ["FINN"]` — only FINN can retrieve
- `accessibleBy: ["*"]` — all agents in the tenant can retrieve
- Wrong `tenantId` → null returned (cross-tenant isolation enforced)
- Expired contexts → null returned
- `expireContexts()` runs periodically to clean stale entries

---

## Intelligence Mesh vs. Operations Graph

| Capability | Operations Graph | Intelligence Mesh |
|---|---|---|
| Entity relationships | ✅ | ✅ |
| Semantic influence weights | ❌ | ✅ |
| Decision tracking | ❌ | ✅ |
| Operator action nodes | ❌ | ✅ |
| Influence scoring | ❌ | ✅ |
| Cross-system context sharing | ❌ | ✅ |
| AI decision lineage | ❌ | ✅ |

---

## Mesh Population Strategy

The mesh is populated by handlers and agents as they process events:

```typescript
// In ivy-dispute handler, after IVY runs:
GLOBAL_MESH.addNode({ id: `decision-${dispute.id}`, type: "decision", domain: "dispute", label: "IVY: refund_customer", weight: 0.87 });
GLOBAL_MESH.addEdge({ from: `decision-${dispute.id}`, to: dispute.id, relationship: "resolved_by", strength: 0.87, metadata: {} });
```

This creates a traversable decision lineage for every automated resolution.
