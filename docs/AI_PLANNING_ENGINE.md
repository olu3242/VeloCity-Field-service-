# AI Planning Engine

## Overview

The AI Planning Engine generates structured execution plans for workstream operations using Claude. Plans include a DAG of execution steps, a risk score, and an estimated duration. The engine uses knowledge context and learning signals to produce contextually-aware plans.

Source: `src/lib/execution/planner.ts`

---

## Model Configuration

- **Model**: `claude-haiku-4-5-20251001`
- **SDK**: `@anthropic-ai/sdk` (existing dependency, v0.36.3)
- **API Key**: `ANTHROPIC_API_KEY` from environment
- **Max tokens**: 2048

Haiku is chosen for its low latency — planning runs inline in the execution pipeline before the business operation itself.

---

## Input

```typescript
async function generateExecutionPlan(
  workstream: string,
  workflow: string,
  intent: string,
  knowledge?: KnowledgeContext,
  riskHints?: string[],
  opts?: PlannerOptions,
): Promise<ExecutionPlan>
```

The planner receives:
- **workstream / workflow**: The operation being planned
- **intent**: Natural language description of the goal
- **knowledge**: Entity context assembled from the knowledge graph (jobs, customers, providers)
- **riskHints**: String array of risk signals extracted from knowledge context + learning signals

---

## Prompt Construction

The system prompt instructs Claude to act as a workflow planning engine and return valid JSON. The user prompt includes:

```
Workstream: {workstream}
Workflow: {workflow}
Intent: {intent}

Knowledge context:
{JSON.stringify(knowledge, null, 2)}

Risk hints:
{riskHints.join("\n")}

Generate an execution plan as valid JSON with this schema:
{
  "steps": [
    { "id": string, "name": string, "description": string, "dependsOn": string[] }
  ],
  "estimatedDurationMs": number,
  "riskScore": number,        // 0-1, 0=safe 1=high-risk
  "plannerNotes": string
}
```

---

## Output

```typescript
interface ExecutionPlan {
  estimatedDurationMs: number;
  parallelNodes: number;       // count of nodes with no inbound edges
  criticalPath: string[];      // node ids on the longest chain
  riskScore: number;           // 0–1
  recommendedRecovery: RecoveryStrategy;
  plannerNotes: string;
  graph: ExecutionGraph;       // built from steps via buildGraph()
}
```

The steps array from Claude's response is passed directly to `buildGraph()` to construct the `ExecutionGraph`.

---

## Fallback

If planning fails for any reason (API error, JSON parse failure, missing API key), the engine falls back to a `singleNodeGraph` and logs a warning. Planning failure is always non-fatal.

```typescript
try {
  const plan = await generateExecutionPlan(...)
  ctx.plan = plan
} catch {
  addAudit(ctx, "planning", "generated", "failure")
  // ctx.plan remains undefined → Stage 8 uses singleNodeGraph fallback
}
```

---

## Risk Score Interpretation

| Score | Meaning | Engine behavior |
|-------|---------|----------------|
| 0.0–0.3 | Low risk | `recommendedRecovery: "skip-node"` |
| 0.3–0.6 | Medium risk | `recommendedRecovery: "retry"` |
| 0.6–0.8 | High risk | `recommendedRecovery: "degrade"` |
| 0.8–1.0 | Critical risk | `recommendedRecovery: "abort"` |

The risk score influences but does not determine the recovery strategy. Digital twin simulation confidence is the primary gate for high-impact workflows.

---

## Learning Signal Integration

Before calling the AI planner, the engine aggregates learning signals from the past 24 hours:

```typescript
const signals = await computeLearningSignals(ctx.tenantId, [ctx.workstream])
const learningHints = formatSignalsAsHints(signals)
// learningHints: ["dispatch success rate: 94% over last 24h", ...]
```

These hints are appended to `riskHints` and included in the planning prompt, giving Claude awareness of recent operational patterns.

---

## Plan Accuracy Scoring

After execution completes, `scorePlanAccuracy` compares the plan's predictions to reality:

```typescript
function scorePlanAccuracy(
  plan: ExecutionPlan,
  actualDurationMs: number,
  actualNodeCount: number,
): number
```

Returns a 0–1 score. This feeds back into the learning system to track planner calibration over time.

---

## Skip Planning

Planning can be disabled at the intent level:

```typescript
// Skip for simple single-step operations
await execute({ ...intent, skipPlanning: true }, fn)

// Skip via engine options
await execute(intent, fn, { skipPlanning: true })
```

When skipped, Stage 7 is recorded as `"skipped"` in the audit trail and the engine proceeds to Stage 8 with `singleNodeGraph`.
