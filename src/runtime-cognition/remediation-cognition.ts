import { logger } from "@/runtime-core/observability"

export interface RemediationCognition {
  cognitionId: string
  failureSignature: string
  tenantId?: string
  learnedActions: {
    action: string
    successRate: number
    avgResolutionMs: number
    timesApplied: number
  }[]
  bestAction?: string
  confidence: number
  cognitiveAge: number
  lastUpdatedAt: string
}

const COGNITIONS: Map<string, RemediationCognition> = new Map()
const MAX_COGNITIONS = 500

export function learnFromRemediation(
  failureSignature: string,
  action: string,
  success: boolean,
  resolutionMs: number,
  tenantId?: string,
): RemediationCognition {
  if (COGNITIONS.size >= MAX_COGNITIONS && !COGNITIONS.has(failureSignature)) {
    const firstKey = Array.from(COGNITIONS.keys())[0]
    if (firstKey !== undefined) COGNITIONS.delete(firstKey)
  }

  const existing = COGNITIONS.get(failureSignature)
  const cognition: RemediationCognition = existing ?? {
    cognitionId: crypto.randomUUID(),
    failureSignature,
    tenantId,
    learnedActions: [],
    confidence: 0,
    cognitiveAge: 0,
    lastUpdatedAt: new Date().toISOString(),
  }

  const actionEntry = cognition.learnedActions.find((a) => a.action === action)
  if (actionEntry) {
    const n = actionEntry.timesApplied
    actionEntry.successRate = (actionEntry.successRate * n + (success ? 1 : 0)) / (n + 1)
    actionEntry.avgResolutionMs = (actionEntry.avgResolutionMs * n + resolutionMs) / (n + 1)
    actionEntry.timesApplied += 1
  } else {
    cognition.learnedActions.push({
      action,
      successRate: success ? 1 : 0,
      avgResolutionMs: resolutionMs,
      timesApplied: 1,
    })
  }

  cognition.cognitiveAge += 1
  cognition.confidence = Math.min(0.99, cognition.cognitiveAge / 20)
  cognition.lastUpdatedAt = new Date().toISOString()

  let bestScore = -1
  for (const a of cognition.learnedActions) {
    const score = a.successRate * a.timesApplied
    if (score > bestScore) { bestScore = score; cognition.bestAction = a.action }
  }

  COGNITIONS.set(failureSignature, cognition)
  logger.info(`Remediation learning updated for ${failureSignature}`, "remediation-cognition", {
    tenantId, metadata: { action, success, cognitiveAge: cognition.cognitiveAge },
  })
  return cognition
}

export function getBestAction(failureSignature: string): string | undefined {
  return COGNITIONS.get(failureSignature)?.bestAction
}

export function getTopCognitions(limit = 10): RemediationCognition[] {
  return Array.from(COGNITIONS.values())
    .sort((a, b) => b.cognitiveAge - a.cognitiveAge)
    .slice(0, limit)
}

export function getCognitionSummary(): { total: number; avgConfidence: number; learnedActions: number } {
  const values = Array.from(COGNITIONS.values())
  const total = values.length
  const avgConfidence = total > 0 ? values.reduce((s, c) => s + c.confidence, 0) / total : 0
  const learnedActions = values.reduce((s, c) => s + c.learnedActions.length, 0)
  return { total, avgConfidence, learnedActions }
}
