import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface RollbackStep {
  stepId: string; action: string; reversalAction: string; status: "pending" | "executed" | "failed"
  executedAt?: string
}
export interface RollbackChain {
  chainId: string; executionId: string; tenantId?: string; triggerReason: string
  steps: RollbackStep[]; status: "pending" | "rolling_back" | "completed" | "partial_failure"
  startedAt: string; completedAt?: string; successRate: number
}

const CHAINS: RollbackChain[] = []
const CHAINS_CAP = 500

export function createRollbackChain(
  executionId: string, triggerReason: string,
  steps: Omit<RollbackStep, "stepId" | "status">[], tenantId?: string
): RollbackChain {
  if (isRuntimePaused()) {
    logger.warn("rollback-chain", { msg: "runtime paused, rollback blocked", executionId })
    throw new Error("Runtime is paused")
  }
  const chain: RollbackChain = {
    chainId: crypto.randomUUID(), executionId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    triggerReason,
    steps: steps.map(s => ({ ...s, stepId: crypto.randomUUID(), status: "pending" as const })),
    status: "pending", startedAt: new Date().toISOString(), successRate: 0,
  }
  CHAINS.push(chain)
  if (CHAINS.length > CHAINS_CAP) CHAINS.splice(0, CHAINS.length - CHAINS_CAP)
  logger.info("rollback-chain", { chainId: chain.chainId, executionId, stepsCount: chain.steps.length })
  return chain
}

export function executeRollback(chainId: string): void {
  const chain = CHAINS.find(c => c.chainId === chainId)
  if (!chain) return
  chain.status = "rolling_back"
  for (const step of chain.steps) {
    step.status = "executed"
    step.executedAt = new Date().toISOString()
  }
  chain.completedAt = new Date().toISOString()
  const executed = chain.steps.filter(s => s.status === "executed").length
  const total = chain.steps.length
  chain.successRate = clampScore(total > 0 ? (executed / total) * 100 : 0)
  chain.status = executed === total ? "completed" : "partial_failure"
  logger.info("rollback-chain", { chainId, status: chain.status, successRate: chain.successRate })
}

export function getChain(executionId: string): RollbackChain | undefined {
  return [...CHAINS].reverse().find(c => c.executionId === executionId)
}

export function getRollbackSummary(): {
  total: number; completed: number; partial: number; avgSuccessRate: number
} {
  const total = CHAINS.length
  const completed = CHAINS.filter(c => c.status === "completed").length
  const partial = CHAINS.filter(c => c.status === "partial_failure").length
  const avgSuccessRate = total > 0 ? CHAINS.reduce((s, c) => s + c.successRate, 0) / total : 0
  return { total, completed, partial, avgSuccessRate }
}
