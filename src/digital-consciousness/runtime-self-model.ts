import { clampScore } from "@/runtime-core/scoring"

export interface RuntimeSelfModel {
  modelId: string
  perceivesItself: {
    subsystemCount: number
    activeWorkflows: number
    queueDepth: number
    healthScore: number
    tenantCount: number
    federationPeers: number
  }
  knownLimitations: string[]
  selfAssessedCapability: number
  lastUpdatedAt: string
  version: number
}

const SELF_MODEL: RuntimeSelfModel = {
  modelId: crypto.randomUUID(),
  perceivesItself: {
    subsystemCount: 0,
    activeWorkflows: 0,
    queueDepth: 0,
    healthScore: 100,
    tenantCount: 0,
    federationPeers: 0,
  },
  knownLimitations: [],
  selfAssessedCapability: 100,
  lastUpdatedAt: new Date().toISOString(),
  version: 1,
}

export function getSelfModel(): RuntimeSelfModel {
  return {
    ...SELF_MODEL,
    perceivesItself: { ...SELF_MODEL.perceivesItself },
    knownLimitations: [...SELF_MODEL.knownLimitations],
  }
}

export function updatePerception(
  key: keyof RuntimeSelfModel["perceivesItself"],
  value: number
): void {
  SELF_MODEL.perceivesItself[key] = value
  SELF_MODEL.lastUpdatedAt = new Date().toISOString()
  SELF_MODEL.version += 1
  recalculateCapability()
}

export function addLimitation(limitation: string): void {
  if (!SELF_MODEL.knownLimitations.includes(limitation)) {
    SELF_MODEL.knownLimitations.push(limitation)
    recalculateCapability()
  }
}

export function removeLimitation(limitation: string): void {
  const idx = SELF_MODEL.knownLimitations.indexOf(limitation)
  if (idx !== -1) {
    SELF_MODEL.knownLimitations.splice(idx, 1)
    recalculateCapability()
  }
}

export function recalculateCapability(): void {
  const { healthScore } = SELF_MODEL.perceivesItself
  const limitationPenalty = SELF_MODEL.knownLimitations.length * 10
  const raw = healthScore * 0.4 + (100 - limitationPenalty) * 0.6
  SELF_MODEL.selfAssessedCapability = clampScore(raw)
  SELF_MODEL.lastUpdatedAt = new Date().toISOString()
}
