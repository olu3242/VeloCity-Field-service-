export interface LatencyProfile {
  profileId: string
  operationType: string
  tenantId?: string
  p50Ms: number
  p95Ms: number
  p99Ms: number
  sloTargetMs: number
  sloMet: boolean
  optimizationApplied?: string
  sampledAt: string
}

const PROFILES: Map<string, LatencyProfile> = new Map()
const CAP = 500

const SLO_TARGETS: Record<string, number> = {
  workflow_start: 500,
  queue_enqueue: 50,
  cognition_decide: 200,
  trace_start: 30,
  federation_relay: 1000,
}

export function profileLatency(
  operationType: string,
  p50: number,
  p95: number,
  p99: number,
  tenantId?: string,
): LatencyProfile {
  if (PROFILES.size >= CAP && !PROFILES.has(operationType)) {
    const firstKey = Array.from(PROFILES.keys())[0]
    if (firstKey !== undefined) PROFILES.delete(firstKey)
  }
  const sloTargetMs = SLO_TARGETS[operationType] ?? 1000
  const profile: LatencyProfile = {
    profileId: crypto.randomUUID(),
    operationType,
    tenantId,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    sloTargetMs,
    sloMet: p99 <= sloTargetMs,
    sampledAt: new Date().toISOString(),
  }
  PROFILES.set(operationType, profile)
  return profile
}

export function applyOptimization(
  operationType: string,
  optimization: string,
): void {
  const profile = PROFILES.get(operationType)
  if (profile) profile.optimizationApplied = optimization
}

export function getSloBreaches(): LatencyProfile[] {
  return Array.from(PROFILES.values()).filter((p) => !p.sloMet)
}

export function getLatencyReport(): {
  total: number
  sloMet: number
  breaching: number
  avgP99Ms: number
  worstOperation: string | undefined
} {
  const all = Array.from(PROFILES.values())
  const metCount = all.filter((p) => p.sloMet).length
  const breaching = all.length - metCount
  const totalP99 = all.reduce((s, p) => s + p.p99Ms, 0)
  let worstOperation: string | undefined
  let worstP99 = -1
  for (const p of all) {
    if (p.p99Ms > worstP99) {
      worstP99 = p.p99Ms
      worstOperation = p.operationType
    }
  }
  return {
    total: all.length,
    sloMet: metCount,
    breaching,
    avgP99Ms: all.length > 0 ? totalP99 / all.length : 0,
    worstOperation,
  }
}
