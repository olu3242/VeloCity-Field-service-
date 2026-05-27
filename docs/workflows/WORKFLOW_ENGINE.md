# VeloCity Workflow Engine

## Architecture

VeloCity's workflow infrastructure combines a 30-state job state machine with a declarative workflow DSL for event-driven business processes.

```
Triggering event arrives
        ↓
WorkflowDefinition.trigger.event matches
        ↓
Steps execute in sequence (onSuccess / onFailure routing)
        ↓
At each step: emit_event | agent_call | human_approval | condition | notify | wait
        ↓
EscalationRules fire if step fails / times out / approval denied
        ↓
Workflow completes → telemetry recorded → learning engine updated
```

---

## Workflow DSL (`src/lib/workflows/dsl.ts`)

### WorkflowDefinition

```typescript
const myWorkflow = defineWorkflow({
  id: "dispute-resolution-v1",
  name: "Dispute Resolution Workflow",
  version: "1.0.0",
  trigger: { event: "dispute_opened" },
  steps: [
    {
      id: "intake",
      type: "agent_call",
      config: { agent: "IVY", action: "analyzeDispute" },
      onSuccess: "evidence_check",
      onFailure: "human_review",
    },
    // ...
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: true,
  tenantConfigurable: true,
});
```

### Step Types

| Type | Description | Config |
|---|---|---|
| `agent_call` | Invoke an AI agent | `{ agent: AgentName, action: string }` |
| `emit_event` | Emit automation event | `{ event: AutomationEventType }` |
| `human_approval` | Pause for admin review | `{ approverRole, timeoutHours }` |
| `condition` | Branch on boolean check | `{ check: string }` |
| `notify` | Send notification | `{ recipients, template }` |
| `wait` | Pause execution | `{ durationMs }` |

### Routing

Each step defines `onSuccess` and `onFailure` referencing another step's `id`. Terminal values: `"end"`, `"escalate"`, `"abort"`.

`validateWorkflow(def)` checks all references are valid before registration.

---

## Human-in-the-Loop (`src/lib/workflows/hitl.ts`)

When a step of type `human_approval` executes, it creates an `ApprovalRequest`:

```typescript
const request = createApprovalRequest({
  workflowId: "dispute-resolution-v1",
  stepId: "human_review",
  requestedBy: "IVY",
  approverRole: "admin",
  title: "Dispute Review Required",
  description: "IVY confidence below threshold. Admin review needed.",
  data: { dispute_id, ivy_recommendation, confidence },
  expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
});
```

Operators resolve via admin UI or API:
```typescript
resolveApproval(request.id, "approved", adminUserId, "Refund customer based on evidence");
```

`expireStaleApprovals()` runs periodically to expire unresolved requests past their deadline.

---

## Escalation Rules

```typescript
escalationRules: [
  { condition: "step_failed",      action: "notify_admin",    notifyRoles: ["admin"] },
  { condition: "approval_denied",  action: "pause_workflow"                           },
  { condition: "timeout",          action: "notify_admin",    notifyRoles: ["admin", "operations"] },
  { condition: "agent_failed",     action: "retry"                                    },
]
```

Escalation actions:
- `notify_admin` — sends notification to specified roles
- `pause_workflow` — halts execution, queues for manual intervention
- `retry` — re-runs the failed step (up to step.retries limit)
- `abort` — terminates workflow, records failure

---

## Workflow Observability

Every workflow execution records:
- Step entry/exit timestamps
- Agent call results and trace IDs
- Human approval decisions (approverRole, resolvedBy, resolution)
- Escalation triggers and actions taken
- Final status: `success | partial | failed | escalated`

Outcomes feed the learning engine (`recordOutcome()`) which builds improvement signals over time.

---

## State Machine (`src/lib/workflows/job-state-machine.ts`)

The 30-state job lifecycle is handled by `JOB_TRANSITIONS: StateTransition[]`, which defines:
- Valid state-to-state transitions
- Allowed roles for each transition
- Whether a reason is required

This is the low-level state enforcement layer. Workflow templates operate at a higher level, orchestrating multiple state transitions + AI decisions + notifications into coherent business processes.
