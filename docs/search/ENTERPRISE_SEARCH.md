# VeloCity Enterprise Search

## Overview

The enterprise search layer (`src/lib/search/`) provides full-text operational search across disputes, jobs, payouts, providers, and AI decisions — with relevance scoring, tenant isolation, and audit log search.

---

## Operational Indexer (`operational-indexer.ts`)

Indexes entities for search:

```typescript
indexEntity({
  entityId: "d-123",
  entityType: "dispute",
  tenantId: "tenant-abc",
  title: "Dispute #123 — Incomplete job",
  content: "Provider claims job completed. Customer disputes quality. Amount $1,200.",
  tags: ["dispute", "quality"],
  indexedAt: new Date().toISOString(),
});

removeFromIndex("d-123");
getIndexSize();  // total indexed documents
```

**Entity types:** `dispute` | `job` | `payout` | `provider` | `ai_decision`

---

## Search Engine (`search-engine.ts`)

Relevance-ranked full-text search:

```typescript
search({
  query: "payment failed stripe",
  tenantId: "tenant-abc",
  entityType: "job",   // optional filter
  limit: 20,
});
// [
//   { entityId, entityType, title, relevanceScore, snippet, tenantId },
//   ...
// ]

searchAcrossTypes("tenant-abc", "payment failed stripe", 20);
// same as search() without entityType filter

getIndexedEntities("tenant-abc", "dispute");
// all indexed disputes for tenant
```

**Relevance scoring:** title match × 2 + content match × 1, normalized to 0–1. Results sorted descending by relevance.

---

## Audit Log Search (`audit-search.ts`)

Searches AI decision and governance audit logs:

```typescript
searchAuditLog({
  tenantId: "tenant-abc",
  agentName: "IVY",        // optional
  eventType: "dispute_opened",  // optional
  fromDate: "2025-05-01",  // optional ISO date
  toDate: "2025-05-31",    // optional ISO date
  limit: 50,
});
// [{ entryId, agentName, eventType, decision, timestamp, tenantId }]

getAuditSummary("tenant-abc");
// { totalEntries, byAgent: { IVY: 47, FINN: 22 }, byDecision: { auto_resolve: 31, escalate: 16 } }
```

All search is scoped to `tenantId` — cross-tenant queries are rejected.
