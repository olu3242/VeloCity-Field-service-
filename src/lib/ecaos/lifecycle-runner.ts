// ECAOS Lifecycle Runner — tracks workstreams through the 12-stage lifecycle.
// Records emitted RuntimeEvents, enforces stage ordering, and surfaces
// any missing events so certification can gate incomplete workstreams.

import {
  RUNTIME_EVENTS, REQUIRED_RUNTIME_EVENTS,
  type RuntimeEvent, type WorkstreamDomain,
} from "./runtime-contract";

export type LifecycleStage =
  | "initialize" | "authenticate" | "resolve_tenant" | "validate_rbac"
  | "load_dependencies" | "execute" | "update_state" | "emit_events"
  | "audit" | "memory" | "certification" | "complete";

const STAGE_ORDER: LifecycleStage[] = [
  "initialize", "authenticate", "resolve_tenant", "validate_rbac",
  "load_dependencies", "execute", "update_state", "emit_events",
  "audit", "memory", "certification", "complete",
];

// Events emitted on each stage transition (the ones we auto-inject)
const STAGE_EVENT_MAP: Partial<Record<LifecycleStage, RuntimeEvent>> = {
  initialize:        "Initialized",
  authenticate:      "Authenticated",
  resolve_tenant:    "TenantResolved",
  validate_rbac:     "RBACValidated",
  load_dependencies: "DependenciesLoaded",
  execute:           "ExecutionStarted",
  update_state:      "StatePersisted",
  audit:             "AuditRecorded",
  memory:            "MemoryWritten",
  certification:     "RuntimeCertified",
  complete:          "Completed",
};

export type WorkstreamRunStatus = "running" | "completed" | "failed" | "aborted";

export interface WorkstreamRun {
  id: string;
  domain: WorkstreamDomain;
  name: string;
  tenantId: string;
  initiatedBy: string;
  currentStage: LifecycleStage;
  stageIndex: number;
  emittedEvents: RuntimeEvent[];
  missingRequiredEvents: RuntimeEvent[];
  status: WorkstreamRunStatus;
  certificationPassed: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

const RUNS = new Map<string, WorkstreamRun>();
const HISTORY: WorkstreamRun[] = [];
const HISTORY_CAP = 500;

function computeMissing(emitted: RuntimeEvent[]): RuntimeEvent[] {
  const emittedSet = new Set(emitted);
  return REQUIRED_RUNTIME_EVENTS.filter(e => !emittedSet.has(e));
}

export function beginWorkstream(params: {
  domain: WorkstreamDomain;
  name: string;
  tenantId: string;
  initiatedBy: string;
  metadata?: Record<string, unknown>;
}): WorkstreamRun {
  const id = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const initialEvent = STAGE_EVENT_MAP["initialize"] as RuntimeEvent;
  const emitted: RuntimeEvent[] = [initialEvent];
  const run: WorkstreamRun = {
    id,
    domain: params.domain,
    name: params.name,
    tenantId: params.tenantId,
    initiatedBy: params.initiatedBy,
    currentStage: "initialize",
    stageIndex: 0,
    emittedEvents: emitted,
    missingRequiredEvents: computeMissing(emitted),
    status: "running",
    certificationPassed: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: params.metadata ?? {},
  };
  RUNS.set(id, run);
  return run;
}

export function advanceStage(id: string, extraEvent?: RuntimeEvent): WorkstreamRun | null {
  const run = RUNS.get(id);
  if (!run || run.status !== "running") return null;
  const nextIndex = run.stageIndex + 1;
  if (nextIndex >= STAGE_ORDER.length) return run;
  run.stageIndex = nextIndex;
  run.currentStage = STAGE_ORDER[nextIndex];
  // Auto-inject stage event
  const stageEvent = STAGE_EVENT_MAP[run.currentStage];
  if (stageEvent && !run.emittedEvents.includes(stageEvent)) {
    run.emittedEvents.push(stageEvent);
  }
  // Inject extra event from caller
  if (extraEvent && !run.emittedEvents.includes(extraEvent)) {
    run.emittedEvents.push(extraEvent);
  }
  // Special: execute stage emits both started and completed
  if (run.currentStage === "execute") {
    if (!run.emittedEvents.includes("ExecutionCompleted")) run.emittedEvents.push("ExecutionCompleted");
  }
  run.missingRequiredEvents = computeMissing(run.emittedEvents);
  run.certificationPassed = run.missingRequiredEvents.length === 0;
  run.updatedAt = new Date().toISOString();
  // Auto-complete when we reach the final stage
  if (run.currentStage === "complete") {
    run.status = "completed";
    run.completedAt = run.updatedAt;
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    RUNS.delete(id);
    if (HISTORY.length >= HISTORY_CAP) HISTORY.shift();
    HISTORY.push(run);
  }
  return run;
}

export function emitEvent(id: string, event: RuntimeEvent): WorkstreamRun | null {
  const run = RUNS.get(id);
  if (!run || run.status !== "running") return null;
  if (!run.emittedEvents.includes(event)) run.emittedEvents.push(event);
  run.missingRequiredEvents = computeMissing(run.emittedEvents);
  run.certificationPassed = run.missingRequiredEvents.length === 0;
  run.updatedAt = new Date().toISOString();
  return run;
}

export function abortWorkstream(id: string, reason: string): void {
  const run = RUNS.get(id);
  if (!run) return;
  run.status = "aborted";
  run.metadata.abortReason = reason;
  run.completedAt = new Date().toISOString();
  run.durationMs = Date.now() - new Date(run.startedAt).getTime();
  RUNS.delete(id);
  if (HISTORY.length >= HISTORY_CAP) HISTORY.shift();
  HISTORY.push(run);
}

export function getActiveWorkstreams(tenantId?: string): WorkstreamRun[] {
  return Array.from(RUNS.values()).filter(r => !tenantId || r.tenantId === tenantId);
}

export function getWorkstreamHistory(limit = 20, tenantId?: string): WorkstreamRun[] {
  return [...HISTORY]
    .filter(r => !tenantId || r.tenantId === tenantId)
    .reverse()
    .slice(0, limit);
}

export function getLifecycleSummary() {
  const active = Array.from(RUNS.values());
  const stageDistribution: Record<string, number> = {};
  for (const r of active) stageDistribution[r.currentStage] = (stageDistribution[r.currentStage] ?? 0) + 1;
  const recent = HISTORY.slice(-100);
  const certPassRate = recent.length ? recent.filter(r => r.certificationPassed).length / recent.length : 0;
  const avgDuration = recent.filter(r => typeof r.durationMs === "number").reduce((s, r) => s + (r.durationMs ?? 0), 0)
    / Math.max(1, recent.filter(r => typeof r.durationMs === "number").length);
  return {
    activeCount: active.length,
    stageDistribution,
    recentCompleted: recent.length,
    certificationPassRate: Math.round(certPassRate * 100) / 100,
    avgDurationMs: Math.round(avgDuration),
    totalRuntimeEvents: RUNTIME_EVENTS.length,
  };
}
