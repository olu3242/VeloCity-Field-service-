/**
 * VeloCity Orchestration Delegate
 *
 * Manages multi-step delegation chains between agents.
 * Tracks step-level progress and overall chain status (cap 200).
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface DelegationStep {
  stepId: string;
  agentName: string;
  taskType: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface DelegationChain {
  rootTaskId: string;
  rootAgent: string;
  steps: DelegationStep[];
  createdAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "partial";
}

// ── Module state ──────────────────────────────────────────────────────────

export const DELEGATION_CHAINS: Map<string, DelegationChain> = new Map();
const CHAIN_CAP = 200;

// ── Helpers ───────────────────────────────────────────────────────────────

function enforceChainCap(): void {
  if (DELEGATION_CHAINS.size <= CHAIN_CAP) return;
  const keys = Array.from(DELEGATION_CHAINS.keys());
  DELEGATION_CHAINS.delete(keys[0]);
}

function resolveChainStatus(
  steps: DelegationStep[],
): "running" | "completed" | "failed" | "partial" {
  const total = steps.length;
  const completed = steps.filter((s) => s.status === "completed").length;
  const failed = steps.filter((s) => s.status === "failed").length;

  if (completed === total) return "completed";
  if (failed === total) return "failed";
  if (failed > 0) return "partial";
  return "running";
}

// ── Public API ────────────────────────────────────────────────────────────

export function createDelegationChain(
  rootTaskId: string,
  rootAgent: string,
  steps: { agentName: string; taskType: string }[],
): DelegationChain {
  const chain: DelegationChain = {
    rootTaskId,
    rootAgent,
    steps: steps.map((s) => ({
      stepId: crypto.randomUUID(),
      agentName: s.agentName,
      taskType: s.taskType,
      status: "pending",
    })),
    createdAt: new Date().toISOString(),
    status: "running",
  };

  DELEGATION_CHAINS.set(rootTaskId, chain);
  enforceChainCap();
  return chain;
}

export function advanceStep(
  rootTaskId: string,
  stepId: string,
  status: "completed" | "failed",
  error?: string,
): void {
  const chain = DELEGATION_CHAINS.get(rootTaskId);
  if (!chain) return;

  const step = chain.steps.find((s) => s.stepId === stepId);
  if (!step) return;

  step.status = status;
  step.completedAt = new Date().toISOString();
  if (error !== undefined) step.error = error;

  chain.status = resolveChainStatus(chain.steps);
  if (chain.status === "completed" || chain.status === "failed") {
    chain.completedAt = new Date().toISOString();
  }
}

export function getDelegationChain(
  rootTaskId: string,
): DelegationChain | undefined {
  return DELEGATION_CHAINS.get(rootTaskId);
}

export function getActiveDelegations(): DelegationChain[] {
  return Array.from(DELEGATION_CHAINS.values()).filter(
    (c) => c.status === "running" || c.status === "partial",
  );
}

export function getDelegationStats(): {
  total: number;
  completed: number;
  failed: number;
  avgSteps: number;
} {
  const chains = Array.from(DELEGATION_CHAINS.values());
  const total = chains.length;
  const completed = chains.filter((c) => c.status === "completed").length;
  const failed = chains.filter((c) => c.status === "failed").length;
  const avgSteps =
    total > 0
      ? chains.reduce((sum, c) => sum + c.steps.length, 0) / total
      : 0;

  return { total, completed, failed, avgSteps };
}
