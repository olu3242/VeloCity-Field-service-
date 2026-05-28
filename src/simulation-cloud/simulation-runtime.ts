import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type SimulationMode = "outage" | "deployment" | "financial" | "stress" | "workflow" | "digital_twin"
export type SimulationStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export interface SimulationRun {
  runId: string
  mode: SimulationMode
  tenantId?: string
  correlationId: string
  status: SimulationStatus
  parameters: Record<string, unknown>
  result?: Record<string, unknown>
  durationMs?: number
  startedAt?: string
  completedAt?: string
  error?: string
  createdAt: string
}

const RUNS: Map<string, SimulationRun> = new Map()
const RUNS_CAP = 1000

function pruneRuns(): void {
  if (RUNS.size >= RUNS_CAP) {
    const oldest = Array.from(RUNS.keys())[0]
    if (oldest) RUNS.delete(oldest)
  }
}

export function createRun(
  mode: SimulationMode,
  parameters: Record<string, unknown>,
  tenantId?: string,
): SimulationRun {
  if (isRuntimePaused()) {
    logger.warn("createRun blocked: runtime is paused", "simulation-runtime", { metadata: { mode } })
    throw new Error("Runtime is paused — simulation blocked")
  }
  pruneRuns()
  const run: SimulationRun = {
    runId: crypto.randomUUID(),
    mode,
    tenantId,
    correlationId: crypto.randomUUID(),
    status: "queued",
    parameters,
    createdAt: new Date().toISOString(),
  }
  RUNS.set(run.runId, run)
  logger.info("Simulation run created", "simulation-runtime", { metadata: { runId: run.runId, mode } })
  return run
}

export function startRun(runId: string): void {
  const run = RUNS.get(runId)
  if (!run) return
  run.status = "running"
  run.startedAt = new Date().toISOString()
}

export function completeRun(runId: string, result: Record<string, unknown>): void {
  const run = RUNS.get(runId)
  if (!run) return
  run.status = "completed"
  run.result = result
  run.completedAt = new Date().toISOString()
  if (run.startedAt) {
    run.durationMs = Date.now() - new Date(run.startedAt).getTime()
  }
}

export function failRun(runId: string, error: string): void {
  const run = RUNS.get(runId)
  if (!run) return
  run.status = "failed"
  run.error = error
  run.completedAt = new Date().toISOString()
}

export function cancelRun(runId: string): void {
  const run = RUNS.get(runId)
  if (!run) return
  run.status = "cancelled"
}

export function getActiveRuns(tenantId?: string): SimulationRun[] {
  return Array.from(RUNS.values()).filter(
    (r) => r.status === "running" && (tenantId === undefined || r.tenantId === tenantId),
  )
}

export function getRunStats(): {
  total: number
  byMode: Record<string, number>
  byStatus: Record<string, number>
  avgDurationMs: number
} {
  const all = Array.from(RUNS.values())
  const byMode: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let durationSum = 0
  let durationCount = 0
  for (const r of all) {
    byMode[r.mode] = (byMode[r.mode] ?? 0) + 1
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (r.durationMs !== undefined) { durationSum += r.durationMs; durationCount++ }
  }
  return { total: all.length, byMode, byStatus, avgDurationMs: durationCount ? durationSum / durationCount : 0 }
}
