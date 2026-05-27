# VeloCity Orchestration Resilience

## Overview

The orchestration resilience layer (`src/lib/orchestration-resilience/`) ensures multi-step workflows survive failures — through execution checkpointing, agent failover rules, degraded-mode fallback behavior, and dynamic fallback routing.

---

## Execution Checkpointing (`checkpoint.ts`)

Save and resume workflow state across failures:

```typescript
const cp = saveCheckpoint("workflow-123", 3, 10, { resolvedSteps: ["audit", "classify"] }, "tenant-abc");
// cp.expiresAt = now + 1 hour

loadCheckpoint("workflow-123");
// returns checkpoint if not expired, undefined if expired

markResumed("workflow-123");
// cp.resumed = true, cp.resumedAt set

expireCheckpoints();
// removes all expired checkpoints, returns count removed

getActiveCheckpoints("tenant-abc");
// all non-expired checkpoints for tenant
```

**Cap:** 500 checkpoints (one per workflowId). TTL: 1 hour.

---

## Agent Failover (`failover.ts`)

Rule-based agent failover when primary agents are unavailable:

```typescript
resolveFailover("IVY", "circuit_open");
// { fallbackAgent: "fallback_agent", strategy: "route_to_fallback" }

recordFailoverDecision("IVY", "circuit_open", "fallback_agent", "circuit_open rule matched");
getFailoverHistory(20);
```

**Pre-registered rules:**

| Primary Agent | Trigger | Fallback | Strategy |
|---|---|---|---|
| IVY | circuit_open | fallback_agent | route_to_fallback |
| FINN | timeout | — | retry |

---

## Degraded Mode (`degraded-mode.ts`)

Per-event-type fallback behavior when AI is unavailable:

```typescript
activateDegradedMode("AI provider timeout");
isDegradedModeActive();  // true

getDegradedAction("dispute_opened");
// { action: "human_review", reason: "Disputes require human review during degraded mode", maxQueueAgeMs: 3_600_000 }

getDegradedAction("payment_failed");
// { action: "queue_for_later", maxQueueAgeMs: 1_800_000 }

deactivateDegradedMode();
```

**Pre-registered degraded actions:**

| Event | Action | Max Queue Age |
|---|---|---|
| dispute_opened | human_review | 1 hour |
| payment_failed | queue_for_later | 30 min |
| sla_breach | human_review | 5 min |
| tip_submitted | auto_approve | 24 hours |

Default (unregistered): `queue_for_later`, 1 hour.

---

## Fallback Router (`fallback-router.ts`)

Routes execution to fallback handlers based on failure reason:

```typescript
resolveFallback("circuit_open");
// { handler: "degraded_mode_handler", priority: "high" }

resolveFallback("timeout");
// { handler: "retry_queue", priority: "medium" }

resolveFallback("rate_limit");
// { handler: "dead_letter_queue", priority: "low" }
```
