# Knowledge Graph Integration

## Overview

The Knowledge Graph Integration layer retrieves entity context before execution begins, giving the AI planner and risk assessment system awareness of the current state of jobs, customers, and providers involved in a workflow.

Source: `src/lib/execution/knowledge.ts`

---

## Underlying Infrastructure

The WEF knowledge integration wraps the platform knowledge graph module at `src/lib/knowledge-graph/index.ts`, which provides:

- `buildJobGraph(tenantId, jobId)` — job with related provider, customer, and service history
- `buildCustomerGraph(tenantId, customerId)` — customer with booking history and preferences
- `buildProviderGraph(tenantId, providerId)` — provider with capacity, performance, and territory
- `buildGraphSummary(graph)` — human-readable summary string
- `searchGraph(tenantId, query)` — vector-similar entity search

The WEF does not modify these functions; it composes them.

---

## API

### `assembleKnowledgeContext(tenantId, opts): Promise<KnowledgeContext>`

```typescript
interface KnowledgeRetrievalOptions {
  jobId?: string;
  customerId?: string;
  providerId?: string;
  intent?: string;
  includeSearch?: boolean;
}
```

Builds a `KnowledgeContext` by:
1. Loading whichever entity graph is relevant (job, customer, or provider)
2. Calling `buildGraphSummary` to produce a text summary
3. Running a semantic search if `includeSearch: true` and no entity hint is provided
4. Assembling risk indicators from entity state

### `getTenantKnowledgeSummary(tenantId): Promise<{ summary, hints }>`

High-level summary of a tenant's operational context. Used by the Command Center.

### `extractRiskHints(ctx: KnowledgeContext): string[]`

Derives risk hint strings from the knowledge context for inclusion in the AI planning prompt:

- High-value customers → `"high-value customer: increased priority"`
- Low provider capacity → `"provider capacity critical"`
- Outstanding jobs → `"X pending jobs in queue"`
- Repeat cancellations → `"customer has recent cancellation history"`

---

## KnowledgeContext Shape

```typescript
interface KnowledgeContext {
  entityType?: "job" | "customer" | "provider" | "tenant";
  entityId?: string;
  nodes?: number;            // count of graph nodes retrieved
  summary?: string;          // text summary from buildGraphSummary
  entities?: KnowledgeEntity[];
  relationships?: KnowledgeRelationship[];
  searchResults?: KnowledgeSearchResult[];
  riskIndicators?: string[];
  retrievedAt: string;       // ISO 8601
}
```

---

## Entity Hint Resolution

The engine accepts entity hints from two sources and normalizes them:

```typescript
// From intent
intent.knowledgeHints = { entityType: "job", entityId: "job_123" }

// From engine options
opts.entityHints = { type: "job", id: "job_123" }

// Normalized in engine.ts Stage 6:
const hintType = kh?.entityType ?? eh?.type;
const hintId   = kh?.entityId   ?? eh?.id;
```

The `intent.knowledgeHints` takes precedence over `opts.entityHints`.

---

## Failure Handling

Knowledge retrieval is always non-fatal. If it fails:
- `ctx.knowledgeContext` remains `undefined`
- `riskHints` remains `[]`
- The audit record shows `outcome: "failure"`
- Planning continues with no knowledge context

This ensures that a knowledge graph service disruption never blocks business operations.

---

## Skip Knowledge

Knowledge retrieval can be skipped:

```typescript
await execute(intent, fn, { skipKnowledge: true })
```

Knowledge is also skipped when `tenantId` is absent (system-level operations).

---

## Integration with AI Planning

The full `KnowledgeContext` object is passed to `generateExecutionPlan`, and `extractRiskHints(ctx.knowledgeContext)` produces the `riskHints` array included in the planning prompt:

```typescript
ctx.knowledgeContext = await assembleKnowledgeContext(...)
riskHints = extractRiskHints(ctx.knowledgeContext)

ctx.plan = await generateExecutionPlan(
  ctx.workstream,
  ctx.workflow,
  ctx.intent,
  ctx.knowledgeContext,    // full context
  [...riskHints, ...learningHints],  // risk signals
)
```

The planner receives both the structured data and the human-readable risk summary, enabling informed plan generation.
