import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface UtilizationSnapshot {
  snapshotId: string
  subsystem: string
  tenantId?: string
  cpuUtilizationPct: number
  memoryUtilizationPct: number
  queueDepth: number
  activeExecutions: number
  maxCapacity: number
  utilizationScore: number
  bottleneckRisk: boolean
  capturedAt: string
}

const SNAPSHOTS: UtilizationSnapshot[] = []
const ROLLING_CAP = 1000

export function captureUtilization(
  subsystem: string,
  cpu: number,
  memory: number,
  queueDepth: number,
  activeExecutions: number,
  maxCapacity: number,
  tenantId?: string
): UtilizationSnapshot {
  if (isRuntimePaused()) {
    logger.warn("captureUtilization blocked: runtime paused", { subsystem })
  }
  const utilizationScore = clampScore((cpu + memory) / 2)
  const bottleneckRisk = utilizationScore >= 85
  const snapshot: UtilizationSnapshot = {
    snapshotId: crypto.randomUUID(),
    subsystem,
    tenantId,
    cpuUtilizationPct: cpu,
    memoryUtilizationPct: memory,
    queueDepth,
    activeExecutions,
    maxCapacity,
    utilizationScore,
    bottleneckRisk,
    capturedAt: new Date().toISOString(),
  }
  SNAPSHOTS.push(snapshot)
  if (SNAPSHOTS.length > ROLLING_CAP) SNAPSHOTS.shift()
  return snapshot
}

export function getLatestUtilization(
  subsystem: string
): UtilizationSnapshot | undefined {
  for (let i = SNAPSHOTS.length - 1; i >= 0; i--) {
    if (SNAPSHOTS[i].subsystem === subsystem) return SNAPSHOTS[i]
  }
  return undefined
}

export function getBottleneckSubsystems(): UtilizationSnapshot[] {
  const latestMap = new Map<string, UtilizationSnapshot>()
  for (const s of SNAPSHOTS) {
    latestMap.set(s.subsystem, s)
  }
  return Array.from(latestMap.values()).filter((s) => s.bottleneckRisk)
}

export function getUtilizationSummary(): {
  total: number
  bottleneckCount: number
  avgCpu: number
  avgMemory: number
  bySubsystem: Record<string, number>
} {
  const total = SNAPSHOTS.length
  const bottleneckCount = SNAPSHOTS.filter((s) => s.bottleneckRisk).length
  const avgCpu =
    total > 0
      ? SNAPSHOTS.reduce((s, r) => s + r.cpuUtilizationPct, 0) / total
      : 0
  const avgMemory =
    total > 0
      ? SNAPSHOTS.reduce((s, r) => s + r.memoryUtilizationPct, 0) / total
      : 0
  const bySubsystem: Record<string, number> = {}
  for (const s of SNAPSHOTS) {
    bySubsystem[s.subsystem] = (bySubsystem[s.subsystem] ?? 0) + 1
  }
  return { total, bottleneckCount, avgCpu, avgMemory, bySubsystem }
}
