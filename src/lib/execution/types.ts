// Workstream Execution Fabric — core type system.
// ExecutionContext is the universal envelope that flows through every stage
// of every business operation, from intent capture to continuous learning.

// ── Node / Graph ──────────────────────────────────────────────────────────────

export type NodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cached";

export interface ExecutionNode {
  id: string;
  name: string;
  workstream: string;
  dependencies: string[];
  status: NodeStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  output?: unknown;
  metadata: Record<string, unknown>;
}

export interface ExecutionEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ExecutionGraph {
  id: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  criticalPath: string[];
  generatedAt: string;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  estimatedDurationMs: number;
  parallelNodes: number;
  criticalPath: string[];
  riskScore: number;
  recommendedRecovery: string;
  plannerNotes: string;
  graph: ExecutionGraph;
}

// ── Actor ─────────────────────────────────────────────────────────────────────

export type ActorSource =
  | "user"
  | "api"
  | "agent"
  | "cron"
  | "webhook"
  | "mobile"
  | "iot"
  | "integration";

export interface Actor {
  id: string;
  role: string;
  tenantId: string | null;
  franchiseId: string | null;
  source: ActorSource;
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  appliedRules: string[];
  requiresSimulation: boolean;
  simulationThreshold: number;
}

// ── Knowledge Context ─────────────────────────────────────────────────────────

export interface KnowledgeContext {
  entityType?: string;
  entityId?: string;
  nodes?: number;
  edges?: number;
  summary?: string;
  retrievedAt: string;
  hints: string[];
}

// ── Simulation Gate ───────────────────────────────────────────────────────────

export type SimulationRecommendation = "proceed" | "abort" | "degrade";

export interface SimulationGate {
  simulated: boolean;
  confidence: number;
  threshold: number;
  passed: boolean;
  predictedImpact: Record<string, number>;
  recommendation: SimulationRecommendation;
  simulatedAt: string;
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

export interface ExecutionSpan {
  spanId: string;
  nodeId: string;
  name: string;
  startedAt: string;
  durationMs: number;
  status: NodeStatus;
  attributes: Record<string, string | number | boolean>;
}

export interface ExecutionTelemetry {
  spans: ExecutionSpan[];
  totalDurationMs: number;
  successRate: number;
  retryCount: number;
  dependencyLatencies: Record<string, number>;
  completedAt?: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  stage: string;
  actor: string;
  action: string;
  outcome: "success" | "failure" | "skipped";
  metadata: Record<string, unknown>;
}

// ── Execution Context (universal envelope) ────────────────────────────────────

export type ExecutionStatus =
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "degraded"
  | "recovering";

export interface ExecutionContext {
  executionId: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  organizationId?: string;
  tenantId: string | null;
  franchiseId: string | null;
  actor: Actor;
  workstream: string;
  workflow: string;
  intent: string;
  runtimeState: Record<string, unknown>;
  dependencies: string[];
  policyDecision: PolicyDecision;
  plan?: ExecutionPlan;
  graph?: ExecutionGraph;
  telemetry: ExecutionTelemetry;
  audit: AuditEntry[];
  knowledgeContext?: KnowledgeContext;
  simulationGate?: SimulationGate;
  startedAt: string;
  completedAt?: string;
  status: ExecutionStatus;
}

// ── Intent (execution entry point) ───────────────────────────────────────────

export interface ExecutionIntent {
  actor: Actor;
  workstream: string;
  workflow: string;
  intent: string;
  correlationId?: string;
  causationId?: string;
  runtimeState?: Record<string, unknown>;
  knowledgeHints?: { entityType: string; entityId: string };
  simulationRequired?: boolean;
  simulationThreshold?: number;
  skipPlanning?: boolean;
  skipSimulation?: boolean;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface ExecutionResult<T = unknown> {
  executionId: string;
  correlationId: string;
  status: ExecutionStatus;
  value?: T;
  error?: string;
  context: ExecutionContext;
  durationMs: number;
}

// ── Metrics / Learning ────────────────────────────────────────────────────────

export interface ExecutionMetrics {
  executionId: string;
  workstream: string;
  workflow: string;
  tenantId: string | null;
  status: ExecutionStatus;
  durationMs: number;
  nodeCount: number;
  parallelNodes: number;
  retryCount: number;
  successRate: number;
  recoveryRate: number;
  slaCompliant: boolean;
  aiPlanAccuracy?: number;
  computedAt: string;
}

export interface LearningSignal {
  workstream: string;
  workflow: string;
  averageDurationMs: number;
  successRate: number;
  topBottleneck?: string;
  recommendation: string;
  computedAt: string;
}

// ── WEF Events ────────────────────────────────────────────────────────────────

export type WEFEventType =
  | "execution.started"
  | "execution.planning"
  | "execution.graph.generated"
  | "execution.node.started"
  | "execution.node.completed"
  | "execution.node.failed"
  | "execution.node.retried"
  | "execution.node.skipped"
  | "execution.recovered"
  | "execution.completed"
  | "execution.failed"
  | "execution.degraded"
  | "ai.plan.requested"
  | "ai.plan.completed"
  | "knowledge.retrieved"
  | "simulation.run"
  | "simulation.passed"
  | "simulation.blocked"
  | "policy.evaluated"
  | "learning.cycle.completed";

export interface WEFEvent {
  eventId: string;
  type: WEFEventType;
  executionId: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  tenantId: string | null;
  actor: string;
  workstream: string;
  workflow: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ── Recovery ──────────────────────────────────────────────────────────────────

export type RecoveryStrategy =
  | "retry"
  | "reroute"
  | "use-cache"
  | "skip-node"
  | "degrade"
  | "abort";

export interface RecoveryResult {
  strategy: RecoveryStrategy;
  recoveredNodes: string[];
  skippedNodes: string[];
  continuedNodes: string[];
  graph: ExecutionGraph;
}

// ── Flame Graph ───────────────────────────────────────────────────────────────

export interface FlameNode {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  depth: number;
  status: NodeStatus;
  children: FlameNode[];
}
