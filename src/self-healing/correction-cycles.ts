import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface CorrectionCycle {
  cycleId: string
  orchestrationId: string
  tenantId?: string
  iteration: number
  detectedAnomalies: string[]
  correctionsApplied: string[]
  correctionScore: number
  converged: boolean
  terminatedAt?: string
  startedAt: string
}

const CYCLES: CorrectionCycle[] = []
const CYCLES_CAP = 500

export function startCorrectionCycle(
  orchestrationId: string,
  tenantId?: string
): CorrectionCycle {
  if (isRuntimePaused()) {
    logger.warn("startCorrectionCycle blocked: runtime paused")
    throw new Error("Runtime is paused")
  }
  const cycle: CorrectionCycle = {
    cycleId: crypto.randomUUID(),
    orchestrationId,
    tenantId,
    iteration: 1,
    detectedAnomalies: [],
    correctionsApplied: [],
    correctionScore: 0,
    converged: false,
    startedAt: new Date().toISOString(),
  }
  CYCLES.push(cycle)
  if (CYCLES.length > CYCLES_CAP) CYCLES.splice(0, CYCLES.length - CYCLES_CAP)
  return cycle
}

export function applyCorrection(
  cycleId: string,
  anomalies: string[],
  corrections: string[]
): void {
  const cycle = CYCLES.find((c) => c.cycleId === cycleId)
  if (!cycle) return
  for (const a of anomalies) cycle.detectedAnomalies.push(a)
  for (const c of corrections) cycle.correctionsApplied.push(c)
  cycle.iteration++
  cycle.correctionScore = clampScore(
    (corrections.length / Math.max(1, anomalies.length)) * 100
  )
  cycle.converged = cycle.correctionScore >= 80 || cycle.iteration >= 10
  if (cycle.converged) cycle.terminatedAt = new Date().toISOString()
}

export function getActiveCycles(tenantId?: string): CorrectionCycle[] {
  return CYCLES.filter(
    (c) => !c.converged && (tenantId === undefined || c.tenantId === tenantId)
  )
}

export function getCorrectionSummary(): {
  total: number
  converged: number
  notConverged: number
  avgIterations: number
  avgScore: number
} {
  const total = CYCLES.length
  const converged = CYCLES.filter((c) => c.converged).length
  const notConverged = total - converged
  const avgIterations = total > 0 ? CYCLES.reduce((s, c) => s + c.iteration, 0) / total : 0
  const avgScore = total > 0 ? CYCLES.reduce((s, c) => s + c.correctionScore, 0) / total : 0
  return { total, converged, notConverged, avgIterations, avgScore }
}
