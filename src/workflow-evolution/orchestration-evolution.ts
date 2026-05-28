import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface EvolutionCycle {
  cycleId: string
  workflowType: string
  tenantId?: string
  fromGeneration: number
  toGeneration: number
  mutationsApplied: number
  adaptationsApplied: number
  fitnessImprovement: number
  status: "running" | "completed" | "failed" | "rolled_back"
  startedAt: string
  completedAt?: string
}

const CYCLES: EvolutionCycle[] = []
const CYCLES_CAP = 200

export function beginEvolutionCycle(workflowType: string, fromGeneration: number, tenantId?: string): EvolutionCycle {
  if (isRuntimePaused()) throw new Error("Runtime is paused — evolution cycles blocked")
  if (CYCLES.length >= CYCLES_CAP) CYCLES.shift()
  const cycle: EvolutionCycle = {
    cycleId: crypto.randomUUID(),
    workflowType,
    tenantId,
    fromGeneration,
    toGeneration: fromGeneration + 1,
    mutationsApplied: 0,
    adaptationsApplied: 0,
    fitnessImprovement: 0,
    status: "running",
    startedAt: new Date().toISOString(),
  }
  CYCLES.push(cycle)
  logger.info(`Evolution cycle begun: ${workflowType} gen ${fromGeneration} → ${cycle.toGeneration}`, "orchestration-evolution", {
    metadata: { cycleId: cycle.cycleId },
  })
  return cycle
}

export function recordMutationApplied(cycleId: string): void {
  const c = CYCLES.find(c => c.cycleId === cycleId)
  if (c) c.mutationsApplied += 1
}

export function recordAdaptationApplied(cycleId: string): void {
  const c = CYCLES.find(c => c.cycleId === cycleId)
  if (c) c.adaptationsApplied += 1
}

export function completeEvolutionCycle(cycleId: string, fitnessImprovement: number): void {
  const c = CYCLES.find(c => c.cycleId === cycleId)
  if (c) { c.status = "completed"; c.fitnessImprovement = fitnessImprovement; c.completedAt = new Date().toISOString() }
}

export function rollbackEvolutionCycle(cycleId: string): void {
  const c = CYCLES.find(c => c.cycleId === cycleId)
  if (c) { c.status = "rolled_back"; c.completedAt = new Date().toISOString() }
}

export function getActiveCycles(tenantId?: string): EvolutionCycle[] {
  return CYCLES.filter(c => c.status === "running" && (!tenantId || c.tenantId === tenantId))
}

export function getEvolutionSummary(): { total: number; completed: number; rolledBack: number; avgFitnessImprovement: number } {
  const total = CYCLES.length
  const completed = CYCLES.filter(c => c.status === "completed").length
  const rolledBack = CYCLES.filter(c => c.status === "rolled_back").length
  const completedCycles = CYCLES.filter(c => c.status === "completed")
  const avgFitnessImprovement = completedCycles.length > 0
    ? completedCycles.reduce((s, c) => s + c.fitnessImprovement, 0) / completedCycles.length
    : 0
  return { total, completed, rolledBack, avgFitnessImprovement }
}
