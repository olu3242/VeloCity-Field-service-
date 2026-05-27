export interface LatencyMeasurement {
  regionId: string
  targetRegion: string
  latencyMs: number
  measuredAt: string
}

const MEASUREMENTS: LatencyMeasurement[] = []
const MEASUREMENT_CAP = 500

export function recordLatency(regionId: string, targetRegion: string, latencyMs: number): void {
  MEASUREMENTS.push({ regionId, targetRegion, latencyMs, measuredAt: new Date().toISOString() })
  if (MEASUREMENTS.length > MEASUREMENT_CAP) MEASUREMENTS.splice(0, MEASUREMENTS.length - MEASUREMENT_CAP)
}

export function getAvgLatency(regionId: string, targetRegion: string): number {
  const relevant = MEASUREMENTS
    .filter((m) => m.regionId === regionId && m.targetRegion === targetRegion)
    .slice(-10)
  if (relevant.length === 0) return 0
  return relevant.reduce((s, m) => s + m.latencyMs, 0) / relevant.length
}

export function getFastestRegion(excludeRegions?: string[]): string | undefined {
  const excluded = new Set(excludeRegions ?? [])
  const regionIds = Array.from(new Set(Array.from(MEASUREMENTS.map((m) => m.regionId))))
    .filter((r) => !excluded.has(r))
  if (regionIds.length === 0) return undefined

  let fastest: string | undefined
  let minAvg = Infinity
  for (const regionId of regionIds) {
    const relevant = MEASUREMENTS.filter((m) => m.regionId === regionId).slice(-10)
    if (relevant.length === 0) continue
    const avg = relevant.reduce((s, m) => s + m.latencyMs, 0) / relevant.length
    if (avg < minAvg) { minAvg = avg; fastest = regionId }
  }
  return fastest
}

export function getLatencyMatrix(): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {}
  const pairs = new Set(MEASUREMENTS.map((m) => `${m.regionId}:${m.targetRegion}`))
  for (const pair of Array.from(pairs)) {
    const [regionId, targetRegion] = pair.split(":")
    if (!regionId || !targetRegion) continue
    if (!matrix[regionId]) matrix[regionId] = {}
    matrix[regionId][targetRegion] = getAvgLatency(regionId, targetRegion)
  }
  return matrix
}
