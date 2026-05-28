import { logger } from "@/runtime-core/observability"

export interface EscalationCognition {
  cognitionId: string
  triggerPattern: string
  tenantId?: string
  learnedChannels: string[]
  resolutionHistory: {
    channel: string
    resolved: boolean
    resolutionMinutes: number
  }[]
  avgResolutionMinutes: number
  cognitiveConfidence: number
  updatedAt: string
}

const COGNITIONS: Map<string, EscalationCognition> = new Map()
const MAX_COGNITIONS = 200

export function learnEscalation(
  triggerPattern: string,
  channel: string,
  resolved: boolean,
  resolutionMinutes: number,
  tenantId?: string,
): EscalationCognition {
  if (COGNITIONS.size >= MAX_COGNITIONS && !COGNITIONS.has(triggerPattern)) {
    const firstKey = Array.from(COGNITIONS.keys())[0]
    if (firstKey !== undefined) COGNITIONS.delete(firstKey)
  }

  const existing = COGNITIONS.get(triggerPattern)
  const cognition: EscalationCognition = existing ?? {
    cognitionId: crypto.randomUUID(),
    triggerPattern,
    tenantId,
    learnedChannels: [],
    resolutionHistory: [],
    avgResolutionMinutes: 0,
    cognitiveConfidence: 0,
    updatedAt: new Date().toISOString(),
  }

  cognition.resolutionHistory.push({ channel, resolved, resolutionMinutes })
  if (cognition.resolutionHistory.length > 10) cognition.resolutionHistory.shift()

  const resolvedRecords = cognition.resolutionHistory.filter((r) => r.resolved)
  cognition.avgResolutionMinutes =
    resolvedRecords.length > 0
      ? resolvedRecords.reduce((s, r) => s + r.resolutionMinutes, 0) / resolvedRecords.length
      : 0

  const channelResolutionCount: Map<string, number> = new Map()
  for (const r of cognition.resolutionHistory) {
    if (r.resolved) {
      channelResolutionCount.set(r.channel, (channelResolutionCount.get(r.channel) ?? 0) + 1)
    }
  }
  cognition.learnedChannels = Array.from(channelResolutionCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ch]) => ch)

  cognition.cognitiveConfidence = Math.min(0.99, cognition.resolutionHistory.length / 10)
  cognition.updatedAt = new Date().toISOString()

  COGNITIONS.set(triggerPattern, cognition)
  logger.info(`Escalation cognition updated for ${triggerPattern}`, "escalation-cognition", {
    tenantId, metadata: { channel, resolved },
  })
  return cognition
}

export function getBestChannels(triggerPattern: string): string[] {
  return COGNITIONS.get(triggerPattern)?.learnedChannels ?? []
}

export function getEscalationSummary(): { total: number; avgResolutionMinutes: number; avgConfidence: number } {
  const values = Array.from(COGNITIONS.values())
  const total = values.length
  const avgResolutionMinutes = total > 0 ? values.reduce((s, c) => s + c.avgResolutionMinutes, 0) / total : 0
  const avgConfidence = total > 0 ? values.reduce((s, c) => s + c.cognitiveConfidence, 0) / total : 0
  return { total, avgResolutionMinutes, avgConfidence }
}
