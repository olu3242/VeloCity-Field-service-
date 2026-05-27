# VeloCity Autonomous Coordination

## Overview

The coordination layer (`src/lib/coordination/`) enables cross-agent task routing, orchestration delegation, adaptive escalation, and multi-agent consensus — all flowing through the event fabric without direct agent-to-agent coupling.

---

## Task Router (`task-router.ts`)

Routes tasks to the most capable available agent:

```typescript
const decision = routeTask(
  "task-abc",       // taskId
  "GABRIEL",        // source agent
  "dispute_opened", // task type
  90,               // priority
  "tenant-abc"      // tenantId
);
// {
//   route: { targetAgent: "IVY", strategy: "priority_lane", estimatedDelayMs: 0 },
//   alternatives: [{ targetAgent: "MAX", ... }],
//   decidedAt: "..."
// }
```

**Routing strategies by priority:**
- ≥ 80 → `priority_lane` (0ms delay)
- 40–79 → `load_balanced` (500ms delay)
- < 40 → `direct` (1000ms delay)

Target selection: first agent in AGENT_REGISTRY whose `supported_events` includes the task type. Falls back to GABRIEL if no match.

---

## Orchestration Delegation (`orchestration-delegate.ts`)

Manages multi-step delegation chains:

```typescript
const chain = createDelegationChain("task-xyz", "GABRIEL", [
  { agentName: "IVY", taskType: "dispute_review" },
  { agentName: "FINN", taskType: "payout_release" },
  { agentName: "ARIA", taskType: "notification_send" },
]);

// As each step completes:
advanceStep(chain.rootTaskId, chain.steps[0].stepId, "completed");
advanceStep(chain.rootTaskId, chain.steps[1].stepId, "completed");
// Chain status: "running" → "partial" → "completed"

getActiveDelegations();  // running or partial chains
```

Chain status: `running` (any pending), `partial` (some failed, some pending), `completed` (all done), `failed` (all failed).

---

## Adaptive Escalation Routing (`adaptive-escalation.ts`)

Pre-registered escalation routes with runtime update capability:

```typescript
resolveEscalation("dispute_opened", "critical");
// { target: "emergency_escalation", maxWaitMs: 10_000 }

resolveEscalation("payment_failed", "high");
// { target: "ai_agent", agentHint: "FINN", maxWaitMs: 120_000 }

resolveEscalation("unknown_event", "medium");
// Default: { target: "human_review", maxWaitMs: 300_000 }

// Adaptive update at runtime:
updateEscalationRoute("payment_failed", "high", { maxWaitMs: 60_000 });
```

Default routes: `dispute_opened:critical` → emergency, `dispute_opened:high` → IVY, `sla_breach:critical` → human, `payment_failed:high` → FINN.

---

## Consensus Handler (`consensus-handler.ts`)

Multi-agent voting for governance decisions:

```typescript
const proposal = proposeConsensus(
  "Increase dispute auto-resolution threshold to $500",
  "GABRIEL",
  0.6,      // 60% approval threshold
  300_000   // 5-minute TTL
);

castVote(proposal.id, "IVY", "approve", "Higher threshold reduces escalations");
castVote(proposal.id, "FINN", "approve");
castVote(proposal.id, "MAX", "reject", "Risk too high without human review");
// 2/3 = 67% ≥ 60% → status: "approved"

getOpenProposals();   // proposals not yet decided or expired
```

---

## Coordination Invariants

1. **All coordination flows through event fabric** — `routeTask()` uses AGENT_REGISTRY but never calls agents directly
2. **Delegation chains are advisory** — actual execution still goes through `emitEvent()` and handlers
3. **Escalation routes are data, not logic** — `resolveEscalation()` returns a route; the caller decides what to do with it
4. **Consensus is non-binding** — proposals record votes; enforcement is via `safe-adaptation.ts` proposals
