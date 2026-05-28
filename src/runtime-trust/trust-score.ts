import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface TrustScore {
  scoreId: string
  entityId: string
  entityType: "workload" | "tenant" | "plugin" | "federation_node" | "operator"
  score: number
  level: "untrusted" | "low" | "medium" | "high" | "verified"
  factors: { name: string; impact: number }[]
  scoredAt: string
  tenantId?: string
}

const SCORES: Map<string, TrustScore> = new Map()

function scoreToTrustLevel(score: number): TrustScore["level"] {
  if (score >= 90) return "verified"
  if (score >= 70) return "high"
  if (score >= 50) return "medium"
  if (score >= 25) return "low"
  return "untrusted"
}

const TRUST_LEVEL_ORDER: TrustScore["level"][] = ["untrusted", "low", "medium", "high", "verified"]

export function scoreTrust(
  entityId: string,
  entityType: TrustScore["entityType"],
  factors: { name: string; impact: number }[],
  tenantId?: string,
): TrustScore {
  const raw = factors.reduce((sum, f) => sum + f.impact, 0)
  const score = clampScore(raw)
  const level = scoreToTrustLevel(score)
  const trustScore: TrustScore = {
    scoreId: crypto.randomUUID(),
    entityId,
    entityType,
    score,
    level,
    factors,
    scoredAt: new Date().toISOString(),
    tenantId,
  }
  SCORES.set(entityId, trustScore)
  logger.info(`Trust scored: ${entityId} (${entityType}) = ${score} [${level}]`, "trust-score", { tenantId })
  return trustScore
}

export function getTrustScore(entityId: string): TrustScore | undefined {
  return SCORES.get(entityId)
}

export function isTrusted(entityId: string, minLevel: TrustScore["level"] = "medium"): boolean {
  const ts = SCORES.get(entityId)
  if (!ts) return false
  return TRUST_LEVEL_ORDER.indexOf(ts.level) >= TRUST_LEVEL_ORDER.indexOf(minLevel)
}

export function getTrustReport(): {
  total: number; byLevel: Record<string, number>; avgScore: number; untrustedEntities: string[]
} {
  const byLevel: Record<string, number> = {}
  const untrustedEntities: string[] = []
  let totalScore = 0
  for (const ts of Array.from(SCORES.values())) {
    byLevel[ts.level] = (byLevel[ts.level] ?? 0) + 1
    totalScore += ts.score
    if (ts.level === "untrusted") untrustedEntities.push(ts.entityId)
  }
  const total = SCORES.size
  return { total, byLevel, avgScore: total > 0 ? totalScore / total : 0, untrustedEntities }
}
