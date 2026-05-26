export type OutcomeType =
  | "dispute_resolved"
  | "payout_released"
  | "job_completed"
  | "escalation_triggered"
  | "workflow_completed"
  | "sla_breached"
  | "retry_succeeded"
  | "retry_failed";

export interface WorkflowOutcome {
  id: string;
  workflowId: string;
  outcomeType: OutcomeType;
  durationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
  humanInterventions: number;
  aiDecisions: number;
  finalStatus: "success" | "partial" | "failed" | "escalated";
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface LearningSignal {
  patternId: string;
  signal:
    | "optimize_path"
    | "increase_timeout"
    | "reduce_retries"
    | "add_human_gate"
    | "remove_human_gate"
    | "change_agent";
  confidence: number;
  evidence: string;
  recommendation: string;
}

const OUTCOMES = new Map<string, WorkflowOutcome>();
const SIGNALS: LearningSignal[] = [];

export function recordOutcome(
  outcome: Omit<WorkflowOutcome, "id" | "recordedAt">
): WorkflowOutcome {
  const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: WorkflowOutcome = { ...outcome, id, recordedAt: new Date().toISOString() };
  OUTCOMES.set(id, full);
  return full;
}

export function analyzeWorkflow(workflowId: string): LearningSignal[] {
  const outcomes = Array.from(OUTCOMES.values()).filter(
    (o) => o.workflowId === workflowId
  );
  if (outcomes.length === 0) return [];

  const newSignals: LearningSignal[] = [];

  const avgDuration =
    outcomes.reduce((sum, o) => sum + o.durationMs, 0) / outcomes.length;
  if (avgDuration > 300_000 && outcomes.length >= 3) {
    newSignals.push({
      patternId: `${workflowId}:timeout`,
      signal: "increase_timeout",
      confidence: 0.7,
      evidence: `Average duration ${Math.round(avgDuration / 1000)}s over ${outcomes.length} outcomes`,
      recommendation: "Increase workflow timeout thresholds to reduce premature failures",
    });
  }

  const totalCompleted = outcomes.reduce((sum, o) => sum + o.stepsCompleted, 0);
  const totalFailed = outcomes.reduce((sum, o) => sum + o.stepsFailed, 0);
  if (totalCompleted > 0 && totalFailed / totalCompleted > 0.3) {
    newSignals.push({
      patternId: `${workflowId}:failure_rate`,
      signal: "add_human_gate",
      confidence: 0.8,
      evidence: `Step failure ratio ${(totalFailed / totalCompleted).toFixed(2)} exceeds 0.3 threshold`,
      recommendation: "Add human review gate before high-failure steps",
    });
  }

  const allNoHuman = outcomes.every((o) => o.humanInterventions === 0);
  const allSuccess = outcomes.every((o) => o.finalStatus === "success");
  if (allNoHuman && allSuccess && outcomes.length >= 3) {
    newSignals.push({
      patternId: `${workflowId}:automation`,
      signal: "remove_human_gate",
      confidence: 0.6,
      evidence: `${outcomes.length} outcomes succeeded without human intervention`,
      recommendation: "Consider removing manual human gates to improve throughput",
    });
  }

  SIGNALS.push(...newSignals);
  return newSignals;
}

export function getSignals(workflowId?: string): LearningSignal[] {
  if (!workflowId) return [...SIGNALS];
  return SIGNALS.filter((s) => s.patternId.startsWith(workflowId));
}

export function getLearningReport(): {
  totalOutcomes: number;
  byWorkflow: Record<string, number>;
  avgDurationMs: number;
  successRate: number;
} {
  const all = Array.from(OUTCOMES.values());
  const byWorkflow: Record<string, number> = {};
  for (const o of all) {
    byWorkflow[o.workflowId] = (byWorkflow[o.workflowId] ?? 0) + 1;
  }
  const avgDurationMs =
    all.length > 0 ? all.reduce((s, o) => s + o.durationMs, 0) / all.length : 0;
  const successRate =
    all.length > 0
      ? all.filter((o) => o.finalStatus === "success").length / all.length
      : 0;
  return { totalOutcomes: all.length, byWorkflow, avgDurationMs, successRate };
}
