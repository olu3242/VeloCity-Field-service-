import { logger } from "@/runtime-core/observability"

export interface AIGovernanceInsight {
  insightId: string
  insightType: "policy_gap" | "violation_pattern" | "over_restriction" | "compliance_drift" | "federation_risk"
  tenantId?: string
  description: string
  affectedPolicies: string[]
  recommendedAction: string
  confidence: number
  priority: "low" | "medium" | "high" | "critical"
  generatedAt: string
  acknowledged: boolean
}

const INSIGHTS: AIGovernanceInsight[] = []
const INSIGHTS_CAP = 300

export function generateInsight(
  type: AIGovernanceInsight["insightType"],
  description: string,
  affectedPolicies: string[],
  recommendation: string,
  confidence: number,
  tenantId?: string
): AIGovernanceInsight {
  if (INSIGHTS.length >= INSIGHTS_CAP) INSIGHTS.shift()
  const clamped = Math.max(0, Math.min(1, confidence))
  const priority: AIGovernanceInsight["priority"] =
    clamped >= 0.85 ? "critical" : clamped >= 0.65 ? "high" : clamped >= 0.4 ? "medium" : "low"
  const insight: AIGovernanceInsight = {
    insightId: crypto.randomUUID(),
    insightType: type,
    tenantId,
    description,
    affectedPolicies,
    recommendedAction: recommendation,
    confidence: clamped,
    priority,
    generatedAt: new Date().toISOString(),
    acknowledged: false,
  }
  INSIGHTS.push(insight)
  logger.info(`AI insight generated: ${type} (${priority})`, "ai-governance", {
    metadata: { insightId: insight.insightId, confidence: clamped },
  })
  return insight
}

export function acknowledgeInsight(insightId: string): void {
  const insight = INSIGHTS.find((i) => i.insightId === insightId)
  if (!insight) return
  insight.acknowledged = true
}

export function getActiveInsights(tenantId?: string): AIGovernanceInsight[] {
  return INSIGHTS.filter(
    (i) => !i.acknowledged && (tenantId === undefined || i.tenantId === tenantId)
  )
}

export function getInsightsByType(type: AIGovernanceInsight["insightType"]): AIGovernanceInsight[] {
  return INSIGHTS.filter((i) => i.insightType === type)
}

export function getInsightSummary(): {
  total: number
  acknowledged: number
  active: number
  byType: Record<string, number>
  byPriority: Record<string, number>
} {
  const byType: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let acknowledged = 0
  for (const i of INSIGHTS) {
    byType[i.insightType] = (byType[i.insightType] ?? 0) + 1
    byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1
    if (i.acknowledged) acknowledged++
  }
  return {
    total: INSIGHTS.length,
    acknowledged,
    active: INSIGHTS.length - acknowledged,
    byType,
    byPriority,
  }
}
