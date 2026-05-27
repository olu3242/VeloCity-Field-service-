# VeloCity Semantic Operational Search

## Overview

The semantic search layer (`src/lib/mesh/semantic-search.ts`) provides fast, tenant-safe operational search across disputes, events, escalations, failures, workflows, AI recommendations, anomalies, and logs.

---

## How It Works

```typescript
// Index an entity
indexEntity({
  id: dispute.id,
  type: "dispute",
  tenantId,
  title: "HVAC unit not functioning after service",
  content: "Customer reports AC still not cooling after technician visit. Provider claims work completed.",
  tags: ["hvac", "no_cooling", "dispute_opened", "high_risk"],
  metadata: { status: "open", risk_score: 82 },
});

// Search
const results = search("hvac cooling dispute", {
  tenantId,
  type: "dispute",
  limit: 10,
});
// Returns: [{ entity, score: 0.93, matchedTerms: ["hvac", "cooling", "dispute"] }]
```

---

## Search Scoring

Relevance is computed by term matching with field weights:

| Field | Weight |
|---|---|
| `title` | ×2 |
| `content` | ×1 |
| `tags` | ×1 |

Score is normalized to 0-1: `matchedHits / (queryTermCount × 4)`.

Results with score > 0 are returned, sorted descending. The `matchedTerms` array shows which query terms contributed.

---

## Searchable Entity Types

| Type | What It Indexes |
|---|---|
| `dispute` | Dispute reason, description, resolution |
| `event` | Automation event type, payload summary |
| `escalation` | Escalation reason, agent involved |
| `failure` | Handler error message, event type |
| `workflow` | Workflow name, step descriptions |
| `recommendation` | AI recommendation text, agent, domain |
| `anomaly` | Anomaly description, category, entity |
| `log` | Agent log summaries |

---

## Tenant Isolation

Search is always tenant-scoped. `search(query, { tenantId })` filters the index to that tenant only. Cross-tenant search is not possible.

`getIndexStats()` returns totals by type and by tenant for capacity monitoring:
```typescript
{
  total: 4823,
  byType: { dispute: 142, event: 2100, failure: 38, ... },
  byTenant: { "tenant-abc": 1200, "tenant-xyz": 3623 }
}
```

---

## When to Index

Index entities at creation and significant state changes:

| Trigger | Entity Indexed |
|---|---|
| `dispute_opened` | Dispute with reason + description |
| `handler_error` | Failure with event type + error message |
| `workflow_complete` | Workflow run with steps + duration |
| AI recommendation produced | Recommendation with reasoning |
| Anomaly recorded | Anomaly with category + description |

---

## Future Enhancements (Roadmap)

| Enhancement | Priority |
|---|---|
| Vector embeddings for semantic similarity | P2 |
| Full-text search via Postgres `tsvector` | P2 |
| Cross-entity relationship traversal in search results | P3 |
| AI-powered search query expansion (synonym detection) | P3 |
| Admin search UI at `/admin/search` | P2 |
