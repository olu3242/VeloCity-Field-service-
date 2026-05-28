import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface FederationTrustProfile {
  profileId: string
  participantId: string
  tenantId?: string
  historicalReliability: number
  signatureCompliance: number
  dataResidencyScore: number
  abuseRiskScore: number
  compositeScore: number
  trustLevel: "trusted" | "probation" | "restricted" | "blocked"
  lastScoredAt: string
}

const PROFILES = new Map<string, FederationTrustProfile>()
const MAX_PROFILES = 500

export function scoreParticipant(
  participantId: string,
  metrics: {
    reliability: number
    signatureCompliance: number
    residency: number
    abuseRisk: number
  },
  tenantId?: string
): FederationTrustProfile {
  if (isRuntimePaused()) {
    logger.warn("scoreParticipant blocked: runtime paused", { participantId })
    throw new Error("Runtime is paused")
  }

  if (PROFILES.size >= MAX_PROFILES && !PROFILES.has(participantId)) {
    const oldest = Array.from(PROFILES.keys())[0]
    PROFILES.delete(oldest)
  }

  const compositeScore = clampScore(
    metrics.reliability * 0.3 +
      metrics.signatureCompliance * 0.25 +
      metrics.residency * 0.25 +
      (100 - metrics.abuseRisk) * 0.2
  )

  const trustLevel: FederationTrustProfile["trustLevel"] =
    compositeScore >= 80
      ? "trusted"
      : compositeScore >= 60
      ? "probation"
      : compositeScore >= 40
      ? "restricted"
      : "blocked"

  const profile: FederationTrustProfile = {
    profileId: crypto.randomUUID(),
    participantId,
    tenantId,
    historicalReliability: metrics.reliability,
    signatureCompliance: metrics.signatureCompliance,
    dataResidencyScore: metrics.residency,
    abuseRiskScore: metrics.abuseRisk,
    compositeScore,
    trustLevel,
    lastScoredAt: new Date().toISOString(),
  }

  PROFILES.set(participantId, profile)
  logger.info("Participant scored", { participantId, compositeScore, trustLevel })
  return profile
}

export function getProfile(participantId: string): FederationTrustProfile | undefined {
  return PROFILES.get(participantId)
}

export function getBlockedParticipants(): FederationTrustProfile[] {
  return Array.from(PROFILES.values()).filter((p) => p.trustLevel === "blocked")
}

export function getTrustSummary(): {
  total: number
  trusted: number
  probation: number
  restricted: number
  blocked: number
  avgScore: number
} {
  const all = Array.from(PROFILES.values())
  const total = all.length
  const avgScore =
    total > 0 ? all.reduce((s, p) => s + p.compositeScore, 0) / total : 0
  return {
    total,
    trusted: all.filter((p) => p.trustLevel === "trusted").length,
    probation: all.filter((p) => p.trustLevel === "probation").length,
    restricted: all.filter((p) => p.trustLevel === "restricted").length,
    blocked: all.filter((p) => p.trustLevel === "blocked").length,
    avgScore,
  }
}
