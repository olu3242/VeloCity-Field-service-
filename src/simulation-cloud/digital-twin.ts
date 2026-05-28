import { logger } from "@/runtime-core/observability"

export interface DigitalTwin {
  twinId: string
  targetSubsystem: string
  tenantId?: string
  mirroredState: Record<string, unknown>
  lastSyncedAt: string
  syncIntervalMs: number
  driftScore: number
  simulationActive: boolean
  simulatedMetrics: {
    throughput: number
    errorRate: number
    latencyMs: number
    saturation: number
  }
  createdAt: string
}

const TWINS: Map<string, DigitalTwin> = new Map()
const TWINS_CAP = 200

function pruneBySubsystem(): void {
  if (TWINS.size >= TWINS_CAP) {
    const oldest = Array.from(TWINS.keys())[0]
    if (oldest) TWINS.delete(oldest)
  }
}

export function createTwin(
  targetSubsystem: string,
  syncIntervalMs = 5000,
  tenantId?: string,
): DigitalTwin {
  pruneBySubsystem()
  const twin: DigitalTwin = {
    twinId: crypto.randomUUID(),
    targetSubsystem,
    tenantId,
    mirroredState: {},
    lastSyncedAt: new Date().toISOString(),
    syncIntervalMs,
    driftScore: 0,
    simulationActive: false,
    simulatedMetrics: { throughput: 0, errorRate: 0, latencyMs: 0, saturation: 0 },
    createdAt: new Date().toISOString(),
  }
  TWINS.set(targetSubsystem, twin)
  logger.info("Digital twin created", "digital-twin", { metadata: { twinId: twin.twinId, targetSubsystem } })
  return twin
}

export function syncTwin(twinId: string, newState: Record<string, unknown>): void {
  const twin = Array.from(TWINS.values()).find((t) => t.twinId === twinId)
  if (!twin) return
  twin.mirroredState = { ...newState }
  twin.lastSyncedAt = new Date().toISOString()
  twin.driftScore = 0
}

export function simulateTwin(
  twinId: string,
  metrics: DigitalTwin["simulatedMetrics"],
): void {
  const twin = Array.from(TWINS.values()).find((t) => t.twinId === twinId)
  if (!twin) return
  twin.simulatedMetrics = { ...metrics }
  twin.simulationActive = true
  twin.driftScore = Math.min(100, twin.driftScore + 10)
}

export function getTwin(targetSubsystem: string): DigitalTwin | undefined {
  return TWINS.get(targetSubsystem)
}

export function getActiveTwins(): DigitalTwin[] {
  return Array.from(TWINS.values()).filter((t) => t.simulationActive)
}

export function getTwinSummary(): {
  total: number
  active: number
  avgDriftScore: number
  highDriftTwins: string[]
} {
  const all = Array.from(TWINS.values())
  const total = all.length
  const active = all.filter((t) => t.simulationActive).length
  const avgDriftScore = total ? all.reduce((s, t) => s + t.driftScore, 0) / total : 0
  const highDriftTwins = all.filter((t) => t.driftScore > 50).map((t) => t.twinId)
  return { total, active, avgDriftScore, highDriftTwins }
}
