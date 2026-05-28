import { type AwarenessLevel } from "./operational-awareness"

export interface DistributedAwarenessReport {
  reportId: string
  region?: string
  tenantId?: string
  nodeAwarenessLevels: Record<string, AwarenessLevel>
  dominantLevel: AwarenessLevel
  consensusHealth: number
  discordantNodes: string[]
  generatedAt: string
}

const REPORTS: DistributedAwarenessReport[] = []
const CAP = 200

const LEVEL_SCORES: Record<AwarenessLevel, number> = {
  monitoring: 90,
  alert: 70,
  focused: 50,
  crisis: 20,
  unaware: 0,
}

function computeDominantLevel(levels: AwarenessLevel[]): AwarenessLevel {
  const counts = new Map<AwarenessLevel, number>()
  for (const level of levels) {
    counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  let dominant: AwarenessLevel = "unaware"
  let maxCount = 0
  for (const [level, count] of Array.from(counts.entries())) {
    if (count > maxCount) { maxCount = count; dominant = level }
  }
  return dominant
}

export function aggregateAwareness(
  nodeAwarenessMap: Record<string, AwarenessLevel>,
  region?: string,
  tenantId?: string
): DistributedAwarenessReport {
  if (REPORTS.length >= CAP) REPORTS.shift()

  const entries = Object.entries(nodeAwarenessMap)
  const levels = entries.map(([, level]) => level)
  const dominantLevel = computeDominantLevel(levels)

  let totalHealth = 0
  for (const level of levels) totalHealth += LEVEL_SCORES[level]
  const consensusHealth = levels.length > 0 ? totalHealth / levels.length : 0

  const discordantNodes = entries
    .filter(([, level]) => level !== dominantLevel)
    .map(([nodeId]) => nodeId)

  const report: DistributedAwarenessReport = {
    reportId: crypto.randomUUID(),
    region,
    tenantId,
    nodeAwarenessLevels: { ...nodeAwarenessMap },
    dominantLevel,
    consensusHealth,
    discordantNodes,
    generatedAt: new Date().toISOString(),
  }
  REPORTS.push(report)
  return report
}

export function getLatestReport(region?: string): DistributedAwarenessReport | undefined {
  const filtered = region ? REPORTS.filter(r => r.region === region) : REPORTS
  return filtered[filtered.length - 1]
}

export function getReportSummary(): {
  total: number
  avgConsensusHealth: number
  crisisReports: number
} {
  let totalHealth = 0
  let crisisReports = 0
  for (const r of REPORTS) {
    totalHealth += r.consensusHealth
    if (r.dominantLevel === "crisis") crisisReports += 1
  }
  return {
    total: REPORTS.length,
    avgConsensusHealth: REPORTS.length > 0 ? totalHealth / REPORTS.length : 0,
    crisisReports,
  }
}
