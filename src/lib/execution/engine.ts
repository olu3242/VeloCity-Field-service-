// Universal Execution Engine — the central orchestrator of the WEF.
// Every business operation flows through this 16-stage pipeline.
// No workstream executes outside this model.
//
// Stage pipeline:
// Intent → Policy → Identity → Tenant → Context → Knowledge → AI Planning →
// Graph Generation → Dependency Resolution → Execution → Persistence →
// Event Publication → Telemetry → Learning → Optimization → Certification

import { generateRequestId } from "@/lib/tracing/span";
import { getAllCircuits, isOpen } from "@/lib/governance/circuit-breaker";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";
import { assembleKnowledgeContext, extractRiskHints } from "./knowledge";
import { evaluateSimulationGate } from "./digital-twin";
import { generateExecutionPlan } from "./planner";
import { executeGraph, singleNodeGraph, computeGraphStats } from "./graph";
import { recoverExecution } from "./recovery";
import { createTelemetry, finalizetelemetry, persistExecutionTrace } from "./telemetry";
import { recordExecutionMetrics, computeLearningSignals, formatSignalsAsHints } from "./learning";
import {
  publishExecutionStarted,
  publishExecutionPlanning,
  publishGraphGenerated,
  publishExecutionCompleted,
  publishExecutionFailed,
  publishExecutionDegraded,
  publishAIPlanRequested,
  publishAIPlanCompleted,
  publishKnowledgeRetrieved,
  publishSimulationRun,
  publishPolicyEvaluated,
  publishLearningCycleCompleted,
} from "./event-fabric";
import type {
  ExecutionContext,
  ExecutionIntent,
  ExecutionResult,
  ExecutionStatus,
  PolicyDecision,
  Actor,
} from "./types";

export interface EngineOptions {
  /** Skip AI planning (use fallback single-node graph) */
  skipPlanning?: boolean;
  /** Skip digital twin simulation even for high-impact workflows */
  skipSimulation?: boolean;
  /** Skip knowledge graph retrieval */
  skipKnowledge?: boolean;
  /** Maximum retries on recoverable failures */
  maxRetries?: number;
  /** Node execution timeout in milliseconds */
  nodeTimeoutMs?: number;
  /** Entity hints for knowledge graph retrieval */
  entityHints?: { type: string; id: string };
}

// ── Policy evaluation ─────────────────────────────────────────────────────────
// Checks governance policies and circuit breakers before any execution begins.

async function evaluatePolicy(
  intent: ExecutionIntent,
  workstreamId: string,
): Promise<PolicyDecision> {
  const appliedRules: string[] = [];
  let allowed = true;
  let reason = "All policies passed";

  // Circuit breaker check
  const circuitKey = `workstream:${workstreamId}`;
  if (isOpen(circuitKey)) {
    allowed = false;
    reason = `Circuit breaker open for workstream "${workstreamId}"`;
    appliedRules.push("circuit-breaker");
  }

  // Policy: actor must have a tenantId for tenant-scoped workstreams
  if (!intent.actor.tenantId && workstreamId !== "executive-intelligence") {
    allowed = false;
    reason = "Tenant context required for this workstream";
    appliedRules.push("tenant-isolation");
  }

  const requiresSimulation = intent.simulationRequired ?? false;
  const simulationThreshold = intent.simulationThreshold ?? 0.75;

  if (allowed) appliedRules.push("governance-pass");

  return {
    allowed,
    reason,
    appliedRules,
    requiresSimulation,
    simulationThreshold,
  };
}

// ── Context factory ───────────────────────────────────────────────────────────

function createExecutionContext(intent: ExecutionIntent): ExecutionContext {
  const executionId = generateRequestId();
  const correlationId = intent.correlationId ?? generateRequestId();
  const traceId = generateRequestId();

  const actor: Actor = intent.actor;

  return {
    executionId,
    correlationId,
    causationId: intent.causationId,
    traceId,
    tenantId: actor.tenantId,
    franchiseId: actor.franchiseId,
    actor,
    workstream: intent.workstream,
    workflow: intent.workflow,
    intent: intent.intent,
    runtimeState: intent.runtimeState ?? {},
    dependencies: [],
    policyDecision: {
      allowed: false,
      reason: "Not yet evaluated",
      appliedRules: [],
      requiresSimulation: false,
      simulationThreshold: 0.75,
    },
    telemetry: createTelemetry(),
    audit: [],
    startedAt: new Date().toISOString(),
    status: "planning",
  };
}

function addAudit(
  ctx: ExecutionContext,
  stage: string,
  action: string,
  outcome: "success" | "failure" | "skipped",
  metadata: Record<string, unknown> = {},
): void {
  ctx.audit.push({
    timestamp: new Date().toISOString(),
    stage,
    actor: ctx.actor.id,
    action,
    outcome,
    metadata,
  });
}

// ── Universal Execution Engine ────────────────────────────────────────────────

export async function execute<T>(
  intent: ExecutionIntent,
  fn: (ctx: ExecutionContext) => Promise<T>,
  opts: EngineOptions = {},
): Promise<ExecutionResult<T>> {
  const ctx = createExecutionContext(intent);

  // ── Stage 1: Intent captured ───────────────────────────────────────────────
  await publishExecutionStarted(ctx);
  addAudit(ctx, "intent", "captured", "success", { intent: intent.intent });

  // ── Stage 2: Policy evaluation ─────────────────────────────────────────────
  ctx.policyDecision = await evaluatePolicy(intent, intent.workstream);
  await publishPolicyEvaluated(ctx, ctx.policyDecision.allowed, ctx.policyDecision.reason);
  addAudit(ctx, "policy", "evaluated", ctx.policyDecision.allowed ? "success" : "failure", {
    reason: ctx.policyDecision.reason,
  });

  if (!ctx.policyDecision.allowed) {
    ctx.status = "failed";
    const err = `Policy denied: ${ctx.policyDecision.reason}`;
    await publishExecutionFailed(ctx, err, 0);
    return {
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      status: "failed",
      error: err,
      context: ctx,
      durationMs: 0,
    };
  }

  // ── Stage 3–4: Identity + Tenant (already in context from intent) ──────────
  addAudit(ctx, "identity", "resolved", "success", { actorId: ctx.actor.id, role: ctx.actor.role });
  addAudit(ctx, "tenant", "resolved", ctx.tenantId ? "success" : "skipped", { tenantId: ctx.tenantId });

  // ── Stage 5: Context assembly — learning signals ───────────────────────────
  addAudit(ctx, "context", "assembled", "success");

  // ── Stage 6: Knowledge Graph ───────────────────────────────────────────────
  let riskHints: string[] = [];
  if (!opts.skipKnowledge && ctx.tenantId) {
    try {
      const kh = intent.knowledgeHints;
      const eh = opts.entityHints;
      // Normalize to a common shape regardless of which hint source is used
      const hintType = kh?.entityType ?? eh?.type;
      const hintId = kh?.entityId ?? eh?.id;
      ctx.knowledgeContext = await assembleKnowledgeContext(ctx.tenantId, {
        jobId: hintType === "job" ? hintId : undefined,
        customerId: hintType === "customer" ? hintId : undefined,
        providerId: hintType === "provider" ? hintId : undefined,
        intent: intent.intent,
        includeSearch: !hintType,
      });
      riskHints = extractRiskHints(ctx.knowledgeContext);
      await publishKnowledgeRetrieved(ctx, ctx.knowledgeContext.entityType ?? "unknown", ctx.knowledgeContext.nodes ?? 0);
      addAudit(ctx, "knowledge", "retrieved", "success", { nodes: ctx.knowledgeContext.nodes });
    } catch {
      addAudit(ctx, "knowledge", "retrieved", "failure");
    }
  }

  // ── Stage 7: AI Planning ───────────────────────────────────────────────────
  await publishExecutionPlanning(ctx);
  if (!opts.skipPlanning && !intent.skipPlanning) {
    await publishAIPlanRequested(ctx);
    try {
      // Enrich with learning signals from the last 24h
      const signals = ctx.tenantId
        ? await computeLearningSignals(ctx.tenantId, [ctx.workstream])
        : [];
      const learningHints = formatSignalsAsHints(signals);

      ctx.plan = await generateExecutionPlan(
        ctx.workstream,
        ctx.workflow,
        ctx.intent,
        ctx.knowledgeContext,
        [...riskHints, ...learningHints],
      );
      await publishAIPlanCompleted(ctx, ctx.plan.riskScore, ctx.plan.estimatedDurationMs);
      addAudit(ctx, "planning", "generated", "success", {
        riskScore: ctx.plan.riskScore,
        nodes: ctx.plan.graph.nodes.length,
      });
    } catch {
      // Planning failure is non-fatal — use fallback graph
      addAudit(ctx, "planning", "generated", "failure");
    }
  }

  // ── Stage 8: Execution Graph generation ───────────────────────────────────
  ctx.graph = ctx.plan?.graph ?? singleNodeGraph(ctx.workstream, ctx.workflow);
  await publishGraphGenerated(ctx);
  addAudit(ctx, "graph", "generated", "success", {
    nodes: ctx.graph.nodes.length,
    criticalPath: ctx.graph.criticalPath.length,
  });

  // ── Stage 9: Digital Twin Simulation (for high-impact workflows) ──────────
  if (!opts.skipSimulation && !intent.skipSimulation && ctx.tenantId) {
    try {
      ctx.simulationGate = await evaluateSimulationGate(
        ctx.tenantId,
        ctx.workflow,
        ctx.runtimeState,
        ctx.policyDecision.simulationThreshold,
      );
      await publishSimulationRun(ctx, ctx.simulationGate.confidence, ctx.simulationGate.passed);
      addAudit(ctx, "simulation", "evaluated", ctx.simulationGate.passed ? "success" : "skipped", {
        confidence: ctx.simulationGate.confidence,
        recommendation: ctx.simulationGate.recommendation,
      });

      if (ctx.simulationGate.recommendation === "abort") {
        ctx.status = "failed";
        const err = `Digital twin simulation blocked execution (confidence: ${ctx.simulationGate.confidence.toFixed(2)}, threshold: ${ctx.simulationGate.threshold})`;
        await publishExecutionFailed(ctx, err, Date.now() - new Date(ctx.startedAt).getTime());
        return {
          executionId: ctx.executionId,
          correlationId: ctx.correlationId,
          status: "failed",
          error: err,
          context: ctx,
          durationMs: Date.now() - new Date(ctx.startedAt).getTime(),
        };
      }

      if (ctx.simulationGate.recommendation === "degrade") {
        ctx.status = "degraded";
        await publishExecutionDegraded(ctx, "Simulation confidence below threshold — executing in degraded mode");
        addAudit(ctx, "simulation", "degraded", "success");
      }
    } catch {
      addAudit(ctx, "simulation", "evaluated", "skipped");
    }
  }

  // ── Stage 10: Dependency resolution ───────────────────────────────────────
  if (ctx.tenantId) {
    try {
      const health = await aggregatePlatformHealth(ctx.tenantId);
      ctx.dependencies = Object.keys(health.dependencies ?? {});
      addAudit(ctx, "dependencies", "resolved", "success", { health: health.health });
    } catch {
      addAudit(ctx, "dependencies", "resolved", "skipped");
    }
  }

  // ── Stages 11–12: Execution ───────────────────────────────────────────────
  // Capture degraded state from simulation before overwriting with "running"
  let degraded = ctx.status === "degraded" || ctx.simulationGate?.recommendation === "degrade";
  ctx.status = "running";
  let value: T | undefined;
  let execError: unknown;

  for (let attempt = 0; attempt <= (opts.maxRetries ?? 2); attempt++) {
    try {
      value = await fn(ctx);
      break;
    } catch (err) {
      execError = err;
      const recovery = await recoverExecution(ctx, err);
      if (recovery.strategy === "retry" && attempt < (opts.maxRetries ?? 2)) {
        ctx.telemetry.retryCount++;
        addAudit(ctx, "execution", `retry-${attempt + 1}`, "failure");
        continue;
      }
      if (recovery.degraded) {
        degraded = true;
      }
      break;
    }
  }

  const completedAt = new Date().toISOString();
  ctx.completedAt = completedAt;
  finalizetelemetry(ctx.telemetry, ctx.startedAt);

  const durationMs = Date.now() - new Date(ctx.startedAt).getTime();

  if (execError && !degraded) {
    ctx.status = "failed";
    const errMsg = execError instanceof Error ? execError.message : String(execError);
    addAudit(ctx, "execution", "completed", "failure", { error: errMsg });
    await publishExecutionFailed(ctx, errMsg, durationMs);
    await persistExecutionTrace(ctx);
    await recordExecutionMetrics(ctx);
    return {
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      status: "failed",
      error: errMsg,
      context: ctx,
      durationMs,
    };
  }

  // ── Stage 13: State Persistence (handled by fn) ───────────────────────────
  addAudit(ctx, "persist", "completed", "success");

  // ── Stage 14: Event Publication ───────────────────────────────────────────
  ctx.status = degraded ? "degraded" : "completed";
  await publishExecutionCompleted(ctx, durationMs);
  addAudit(ctx, "events", "published", "success");

  // ── Stage 15: Telemetry ───────────────────────────────────────────────────
  await persistExecutionTrace(ctx);
  addAudit(ctx, "telemetry", "persisted", "success");

  // ── Stage 16: Learning + Certification ───────────────────────────────────
  await recordExecutionMetrics(ctx);
  if (ctx.tenantId) {
    await publishLearningCycleCompleted(ctx, 1);
  }
  addAudit(ctx, "learning", "recorded", "success");

  return {
    executionId: ctx.executionId,
    correlationId: ctx.correlationId,
    status: ctx.status,
    value,
    context: ctx,
    durationMs,
  };
}

// ── Fabric health snapshot (for Command Center) ───────────────────────────────

export interface FabricHealthSnapshot {
  activeCircuits: number;
  openCircuits: number;
  fabricHealth: "healthy" | "degraded" | "offline";
  checkedAt: string;
}

export function getFabricHealthSnapshot(): FabricHealthSnapshot {
  const circuits = getAllCircuits();
  const openCount = circuits.filter((c) => c.state === "open").length;

  let fabricHealth: FabricHealthSnapshot["fabricHealth"] = "healthy";
  if (openCount > 0) fabricHealth = "degraded";
  if (openCount > circuits.length * 0.5) fabricHealth = "offline";

  return {
    activeCircuits: circuits.length,
    openCircuits: openCount,
    fabricHealth,
    checkedAt: new Date().toISOString(),
  };
}
