// Workstream Reliability Framework — core contract types.
// Every API, worker, cron, AI agent, and UI component that participates in the
// platform runtime must reference these types to share a common execution contract.

export type WorkstreamStatus =
  | "initializing"
  | "ready"
  | "degraded"
  | "failed"
  | "recovering";

export type DependencyHealth = "healthy" | "degraded" | "offline" | "recovering" | "unknown";
export type WorkstreamHealth = "healthy" | "degraded" | "offline";

export type WorkstreamCategory =
  | "dispatch"
  | "payments"
  | "ai"
  | "automation"
  | "franchise"
  | "customer"
  | "provider"
  | "admin"
  | "intelligence";

export type WorkstreamStage =
  | "initialize"
  | "authenticate"
  | "resolve-tenant"
  | "resolve-franchise"
  | "validate-membership"
  | "validate-rbac"
  | "load-dependencies"
  | "execute"
  | "persist"
  | "publish-events"
  | "notify"
  | "observe"
  | "recover"
  | "certify";

export interface DependencyStatus {
  name: string;
  displayName?: string;
  health: DependencyHealth;
  latencyMs?: number;
  error?: string;
  lastChecked: string;
  critical: boolean;
}

export interface WorkstreamErrorRecord {
  code: string;
  message: string;
  httpStatus: number;
  dependency?: string;
  retryable: boolean;
  correlationId: string;
  timestamp: string;
  stage: WorkstreamStage;
}

// The shared runtime state carried through every workstream execution.
// All 14 lifecycle stages read and write into this contract.
export interface WorkstreamRuntimeState {
  workstream: string;
  status: WorkstreamStatus;
  correlationId: string;
  requestId: string;
  tenantId: string | null;
  franchiseId: string | null;
  organizationId: string | null;
  workflowId: string | null;
  latency: number;
  retryCount: number;
  dependencies: DependencyStatus[];
  warnings: string[];
  errors: WorkstreamErrorRecord[];
  lastSuccess: string | null;
  health: WorkstreamHealth;
  degraded: boolean;
  recoverable: boolean;
}

export interface WorkstreamDefinition {
  id: string;
  name: string;
  description: string;
  dependencies: string[];
  permissions: string[];
  slaMs: number;
  category: WorkstreamCategory;
  critical: boolean;
}

export interface WorkstreamContext {
  workstream: string;
  correlationId: string;
  requestId: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  franchiseId?: string;
  organizationId?: string;
}

export interface WorkstreamResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: WorkstreamErrorRecord;
  state: WorkstreamRuntimeState;
  durationMs: number;
}

export interface PlatformDependencyDefinition {
  name: string;
  displayName: string;
  category: "database" | "cache" | "ai" | "payment" | "queue" | "external";
  critical: boolean;
}

export interface WorkstreamHealthEntry {
  id: string;
  name: string;
  health: WorkstreamHealth;
  latencyMs: number | null;
  recentFailures: number;
  dependencies: DependencyStatus[];
  critical: boolean;
  category: WorkstreamCategory;
  slaMs: number;
  slaViolation: boolean;
}

export interface WorkerHealthEntry {
  recentFailures: number;
  pendingItems: number;
  stuckItems: number;
  health: WorkstreamHealth;
  lastRun: string | null;
}

export interface QueueHealthEntry {
  depth: number;
  stuck: number;
  oldestItemAgeMs: number | null;
  health: WorkstreamHealth;
}

export interface RuntimeHealth {
  mode: "distributed" | "standalone";
  redisConfigured: boolean;
  circuitBreakerCount: number;
  rateLimitMode: "distributed" | "in-memory";
  tracingEnabled: boolean;
}

export interface PlatformHealthReport {
  workstreams: Record<string, WorkstreamHealthEntry>;
  dependencies: Record<string, DependencyStatus>;
  workers: { automation: WorkerHealthEntry };
  queues: { automation: QueueHealthEntry };
  runtime: RuntimeHealth;
  health: WorkstreamHealth;
  errors: string[];
  generatedAt: string;
}
