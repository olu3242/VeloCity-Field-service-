import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { buildScore, clampScore } from "@/runtime-core/scoring"

export type MeshTier = "local" | "regional" | "global"

export interface MeshState {
  meshId: string
  tier: MeshTier
  connectedPeers: number
  sharedLearningsCount: number
  receivedLearningsCount: number
  trustScore: number
  startedAt: string
  lastSyncAt?: string
}

const MESH_STATE: MeshState = {
  meshId: crypto.randomUUID(),
  tier: "local",
  connectedPeers: 0,
  sharedLearningsCount: 0,
  receivedLearningsCount: 0,
  trustScore: 80,
  startedAt: new Date().toISOString(),
}

export function getMeshState(): MeshState {
  return { ...MESH_STATE }
}

export function setMeshTier(tier: MeshTier): void {
  if (isRuntimePaused()) {
    logger.warn("setMeshTier blocked: runtime paused", "intelligence-mesh")
    return
  }
  MESH_STATE.tier = tier
  logger.info(`Mesh tier set to ${tier}`, "intelligence-mesh")
}

export function recordShared(): void {
  MESH_STATE.sharedLearningsCount += 1
  MESH_STATE.lastSyncAt = new Date().toISOString()
}

export function recordReceived(): void {
  MESH_STATE.receivedLearningsCount += 1
  MESH_STATE.lastSyncAt = new Date().toISOString()
}

export function updateTrustScore(score: number): void {
  MESH_STATE.trustScore = clampScore(score)
  logger.info(`Mesh trust score updated: ${MESH_STATE.trustScore}`, "intelligence-mesh")
}

export function getMeshHealth(): number {
  const score = buildScore(MESH_STATE.trustScore, "health", { confidence: 0.8 })
  return score.value
}
