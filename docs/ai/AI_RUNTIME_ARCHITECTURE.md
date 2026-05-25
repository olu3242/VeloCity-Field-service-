# VeloCity AI Runtime Architecture

## Overview

VeloCity operates as an enterprise AI-native operational platform. All AI capabilities are routed through a shared execution runtime — no page-level AI, no isolated inference chains.

```
UI / API Layer
     ↓
automation_events table
     ↓
automation_queue (worker)
     ↓
routeAutomationEvent (router.ts)
     ↓
Handler (alice-intake, max-dispatch, …)
     ↓
dispatchAgent (runtime/ai/dispatcher.ts)
     ↓
runAgent (agents/runAgent.ts)
     ↓
BaseAgent.run → Anthropic API
     ↓
agent_logs → observability
```

---

## Layers

### 1. Event Fabric (`src/lib/automation/`)
- `emitEvent()` — write to `automation_events`, enqueue to `automation_queue`
- `worker.ts` — polls queue, creates `automation_runs`, calls router
- `router.ts` — dispatches each `AutomationEventType` to its canonical handler

### 2. Handler Layer (`src/lib/automation/handlers/`)
13 canonical handlers, one per domain:

| Handler | Domain |
|---|---|
| `alice-intake` | Customer intake & classification |
| `max-dispatch` | Provider matching & dispatch |
| `nova-workflow` | Job workflow state machine |
| `quinn-quote` | Quote validation & pricing |
| `finn-payment` | Payment & payout processing |
| `rex-completion` | Quality scoring & trust |
| `ivy-dispute` | Dispute resolution |
| `lena-retention` | Customer retention & rebooking |
| `tess-territory` | Territory & market intelligence |
| `payout-release` | Payout lifecycle |
| `provider-offer` | Offer routing |
| `sla-check` | SLA monitoring |
| `tip-submitted` | Post-service tip flow |

### 3. AI Execution Runtime (`src/lib/runtime/ai/`)
- `dispatcher.ts` — `dispatchAgent<T>()`: registry check → context hydration → trace → runAgent → audit
- `context.ts` — `hydrateContext()`: enriches AgentContext with provider/customer/job/queue history (tenant-safe, non-blocking)
- `tracing.ts` — `createTrace()` / `recordTrace()`: propagates trace IDs through agent_logs

### 4. Agent Registry (`src/lib/agents/registry.ts`)
Canonical metadata for all 10 agents:
- `agent_id`, `capability_type`, `supported_events`
- `execution_limits` (max_tokens, timeout_ms, max_retries)
- `retry_policy`, `audit_requirements`, `observability_hooks`
- Runtime queries: `getAgent()`, `getAgentsByEvent()`, `getActiveAgents()`

### 5. Governance Layer (`src/lib/governance/`)
- `policies.ts` — `DEFAULT_POLICIES`: rate limits, approval requirements, safety rules
- `circuit-breaker.ts` — Per-agent/event-type circuit breaker (in-memory, 5-failure threshold)
- `safety.ts` — Dedup, flood protection, runaway loop prevention
- `operator.ts` — Admin runtime pause/resume, agent disable/enable
- `tenant.ts` — Tenant isolation enforcement

---

## Agent Catalog

| Agent | ID | Type | Key Capability |
|---|---|---|---|
| ALICE | alice-v1 | intake | Classify service requests, detect serviceability |
| MAX | max-v1 | dispatch | Match providers, score compatibility |
| QUINN | quinn-v1 | quote | Validate quotes, detect price anomalies |
| NOVA | nova-v1 | workflow | Orchestrate job state transitions |
| REX | rex-v1 | quality | Score provider trust, analyze reviews |
| IVY | ivy-v1 | dispute | Recommend dispute resolution |
| FINN | finn-v1 | finance | Monitor payment health, flag anomalies |
| LENA | lena-v1 | retention | Predict churn, trigger rebooking campaigns |
| TESS | tess-v1 | territory | Analyze market signals, surface expansion ops |
| GABRIEL | gabriel-v1 | governance | Compliance audit, fraud screening |

---

## Design Principles

1. **No page-level AI** — All AI calls originate from handlers, never from Next.js page components or API routes directly.
2. **Tenant isolation** — Every agent log, context query, and recommendation is scoped to `tenant_id`.
3. **Fallback-safe** — Every agent implements `getFallback()` — platform operates without AI key.
4. **Audit-complete** — Every agent execution writes to `agent_logs`. GABRIEL governance writes to `audit_logs` on every processed event.
5. **Observable** — Token usage, latency, and trace IDs written on every run.

---

## Runtime Contracts

All types shared via `src/lib/contracts/`:
- `AgentName`, `AgentContext`, `AgentResult` — `contracts/agents.ts`
- `AutomationEventType`, `VeloEvent<T>` — `contracts/events.ts`
- `QueueHealth`, `PlatformHealth` — `contracts/runtime.ts`
- `NotificationPayload` — `contracts/notifications.ts`
