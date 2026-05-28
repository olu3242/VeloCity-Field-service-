import { logger } from "@/runtime-core/observability"

export interface WorkflowSimulationResult {
  resultId: string
  workflowType: string
  tenantId?: string
  simulatedSteps: number
  successfulSteps: number
  failedSteps: number
  retries: number
  estimatedDurationMs: number
  criticalPathMs: number
  bottleneckSteps: string[]
  successProbability: number
  runId?: string
  simulatedAt: string
}

const RESULTS: WorkflowSimulationResult[] = []
const RESULTS_CAP = 500

export function simulateWorkflow(
  workflowType: string,
  steps: number,
  avgStepMs: number,
  tenantId?: string,
  runId?: string,
): WorkflowSimulationResult {
  if (RESULTS.length >= RESULTS_CAP) RESULTS.shift()

  const successProbability = Math.min(0.99, Math.max(0.50, 1 - steps * 0.02))
  const failedSteps = Math.floor(steps * (1 - successProbability))
  const successfulSteps = steps - failedSteps
  const retries = failedSteps * 2
  const estimatedDurationMs = steps * avgStepMs * (1 + retries * 0.1)
  const criticalPathMs = estimatedDurationMs * 0.7

  const bottleneckSteps: string[] =
    steps >= 3 ? [`step_1`, `step_${steps}`] : []

  const result: WorkflowSimulationResult = {
    resultId: crypto.randomUUID(),
    workflowType,
    tenantId,
    simulatedSteps: steps,
    successfulSteps,
    failedSteps,
    retries,
    estimatedDurationMs,
    criticalPathMs,
    bottleneckSteps,
    successProbability,
    runId,
    simulatedAt: new Date().toISOString(),
  }
  RESULTS.push(result)
  logger.info("Workflow simulated", "workflow-simulator", {
    metadata: { resultId: result.resultId, workflowType, steps, successProbability },
  })
  return result
}

export function getSimulationSummary(): {
  total: number
  avgSuccessProbability: number
  avgDurationMs: number
} {
  const total = RESULTS.length
  if (total === 0) return { total: 0, avgSuccessProbability: 0, avgDurationMs: 0 }
  const avgSuccessProbability = RESULTS.reduce((s, r) => s + r.successProbability, 0) / total
  const avgDurationMs = RESULTS.reduce((s, r) => s + r.estimatedDurationMs, 0) / total
  return { total, avgSuccessProbability, avgDurationMs }
}
