# Runtime Convergence Audit (Batch X, Phase 3)

Scope: every agent registry, automation/workflow registry, orchestration system, queue/routing system, and "framework"-named module under `src/lib/` and `src/app/`. Read-only, file:line evidence only — no code removed in this document.

## AUTHORITATIVE (drives real execution today)

| System | File | Real callers (file:line) | Evidence |
|---|---|---|---|
| `AGENT_REGISTRY` | `src/lib/agents/registry.ts` | `src/app/admin/command-center/page.tsx:22` (Agent Activity table), `src/lib/coordination/task-router.ts:8,84-88`, `src/lib/ai-marketplace/capability-registry.ts:6` | Drives agent lookup/capability matching consumed elsewhere in the active flow |
| `BaseAgent.run()` | `src/lib/agents/base.ts` | Every agent subclass; unconditional `agent_logs` write | Single execution contract for all 10 agents |
| `runAgent()` | `src/lib/agents/runAgent.ts` | Every automation handler in `src/lib/automation/handlers/*.ts` | Dispatches by agent name to the real agent instance |
| Automation router | `src/lib/automation/router.ts` | `src/lib/automation/worker.ts` (processes `automation_queue`) ← `src/app/api/cron/automation/route.ts` (real cron, registered in `vercel.json`) | `routeAutomationEvent()` switch maps every `AutomationEventType` to a real handler; GABRIEL governance log fires unconditionally at router.ts:260 |
| `emitEvent()` | `src/lib/automation/emitEvent.ts` | Called from job/quote/payment/dispute API routes | Writes `automation_events` then `automation_queue`; this is the actual event-emission entry point |
| Job state machine | `src/lib/workflows/job-state-machine.ts` | `src/app/api/jobs/[id]/transition/route.ts:64` (`canTransition()` gates every transition) | Enforced, not descriptive — invalid transitions are rejected at this line |

## LEGACY (real code, but descriptive/secondary — not part of the active execution path)

| System | File | Actual usage | Why it's LEGACY not ORPHANED |
|---|---|---|---|
| `RUNTIME_REGISTRY` | `src/lib/registry/runtimes.ts` | **Only** caller: `src/app/admin/lax/page.tsx` (renders `getRuntimesByStatus()`, `getOverallArchitectureScore()`); also read (status-filter only) by `src/lib/governance/drift-detector.ts:2,36,41` | Pure descriptive metadata for the LAX governance dashboard. `getRuntimeById()` has zero callers. Does not drive dispatch, routing, or any business decision. |
| `CAPABILITIES` map | `src/lib/ai-marketplace/capability-registry.ts` | `src/lib/scaling/execution-quotas.ts`, `src/lib/revenue-infra/metered-billing.ts`, `src/lib/federation/capability-discovery.ts` | Derived from `AGENT_REGISTRY`; consumed by quota/billing modules but is not itself the dispatch path |
| `src/lib/coordination/task-router.ts` (`routeTask()`) | same | Uses `AGENT_REGISTRY.supported_events` for lookup, but `routeTask()` itself has no caller in the live event flow (the live flow is `emitEvent → automation_queue → worker → router.ts`) | Real code, unused in production path |
| `src/lib/orchestration/distributed-fabric.ts` | same | `src/lib/capacity/worker-saturation.ts:40` calls `getWorkerHealth()` | Used only for capacity telemetry, not for actual task assignment |
| `src/lib/regions/region-registry.ts`, `src/lib/swarm-coordination/swarm-registry.ts`, `src/lib/runtime-state/state-registry.ts` | same | Each has at least one real caller (`failover-router.ts`, `task-distributor.ts`, `control-plane.ts` respectively) | Supplementary telemetry/monitoring layers, not part of the booking→dispatch→completion path |

## ORPHANED (zero callers anywhere in `src/`)

All of the following are real, compiling modules with zero call sites outside their own file — confirmed by the Batch X Explore sweep:

- `src/lib/automation-marketplace/workflow-registry.ts` (`REGISTRY`, `publishTemplate()`, `getTemplate()`)
- `src/lib/ai-marketplace/orchestration-templates.ts` (`TEMPLATES`, `getTemplatesForEvent()`)
- `src/lib/deployment-governance/deployment-registry.ts`
- `src/lib/ecosystem-connectors/connector-registry.ts`
- `src/lib/enterprise-contracts/contract-registry.ts` (only consumer, `governance-enforcer.ts`, is itself orphaned)
- `src/lib/cross-platform/platform-registry.ts`
- `src/lib/global-workflows/federation-registry.ts`
- `src/lib/migrations/migration-registry.ts`
- `src/lib/plugins/registry.ts` (its only consumer, `hooks.ts`, is itself never called)
- `src/lib/velocity-os/platform-registry.ts`
- `src/lib/distributed-queues/queue-fabric.ts`
- `src/lib/distributed-queues/queue-router.ts` (`resolveQueue()` never invoked despite pre-seeded routes)
- `src/lib/orchestration/routing-engine.ts` (`routeWorkload()`, `setTenantTier()` never invoked)

## Duplicate / dead execution path findings

- **No duplicate dispatch path**: confirmed only one real dispatch path exists — `src/app/api/admin/dispatch/route.ts:74` calls `max.match()` directly; `/dispatch/dashboard` is read-only UI over the same queue, not a second orchestrator. `task-router.ts`, `routing-engine.ts`, and `queue-router.ts` are dead alternatives that were never wired in — they do not run in parallel with or compete against the real path; they simply don't run at all.
- **No duplicate automation/event framework**: `automation/router.ts` + `worker.ts` + `emitEvent.ts` is the single authoritative event pipeline. The various `*-registry.ts` orchestration modules under `deployment-governance/`, `ecosystem-connectors/`, `global-workflows/`, `velocity-os/`, `cross-platform/`, `distributed-queues/`, `plugins/`, `migrations/` are dead scaffolding from the same earlier "Neural Runtime" engagement that the now-orphaned database tables (migrations 011-013) belong to — same pattern, same root cause, never connected to the live booking/dispatch/payment flow.
- **No duplicate agent registry**: `AGENT_REGISTRY` (`src/lib/agents/registry.ts`) is the only registry that actually drives agent dispatch. `CAPABILITIES`/`task-router.ts` derive from it rather than competing with it.

## Classification rule applied

A system is AUTHORITATIVE only if a real, currently-scheduled or currently-routed code path (cron in `vercel.json`, API route, or another AUTHORITATIVE system) calls it. LEGACY if it has at least one real, non-rendering-only caller but isn't on the booking/dispatch/payment critical path. ORPHANED if grep across `src/` finds zero call sites outside its own file.

## Conclusion

The platform's real runtime is small: `AGENT_REGISTRY` + `runAgent()`/`BaseAgent` + `automation/router.ts`/`worker.ts`/`emitEvent.ts` + `job-state-machine.ts`. Everything else discovered in this sweep is either descriptive metadata (LEGACY, safe to leave alone — removing it would require touching the LAX dashboard) or fully dead code (ORPHANED, candidate for future removal in a dedicated cleanup batch, **not this one** — Rule 1 of Batch X forbids new feature work but removing dead `src/` modules is a structural change outside this batch's stated migration-only cleanup scope and is flagged here as a recommendation for the next convergence pass, not executed now).
