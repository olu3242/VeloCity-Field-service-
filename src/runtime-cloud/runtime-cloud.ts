import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type CloudTier = "standard" | "professional" | "enterprise" | "global"

export interface RuntimeCloudState {
  cloudId: string
  tier: CloudTier
  regionCount: number
  activeTenantsCount: number
  totalExecutionCapacity: number
  usedExecutionCapacity: number
  federatedNetworks: number
  cloudHealthScore: number
  startedAt: string
  lastHeartbeatAt: string
}

const CLOUD_STATE: RuntimeCloudState = {
  cloudId: crypto.randomUUID(),
  tier: "standard",
  regionCount: 1,
  activeTenantsCount: 0,
  totalExecutionCapacity: 1000,
  usedExecutionCapacity: 0,
  federatedNetworks: 0,
  cloudHealthScore: 100,
  startedAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
}

export function getCloudState(): RuntimeCloudState {
  return { ...CLOUD_STATE }
}

export function setCloudTier(tier: CloudTier): void {
  if (isRuntimePaused()) {
    logger.warn("setCloudTier blocked: runtime is paused", "runtime-cloud", { metadata: { tier } })
    throw new Error("Runtime is paused — tier change blocked")
  }
  CLOUD_STATE.tier = tier
  const capacityMap: Record<CloudTier, number> = {
    standard: 1000, professional: 5000, enterprise: 20000, global: 100000,
  }
  CLOUD_STATE.totalExecutionCapacity = capacityMap[tier]
  logger.info("Cloud tier updated", "runtime-cloud", { metadata: { tier } })
}

export function updateCapacity(used: number): void {
  CLOUD_STATE.usedExecutionCapacity = Math.max(0, used)
}

export function registerTenant(): void {
  CLOUD_STATE.activeTenantsCount++
}

export function deregisterTenant(): void {
  CLOUD_STATE.activeTenantsCount = Math.max(0, CLOUD_STATE.activeTenantsCount - 1)
}

export function registerFederatedNetwork(): void {
  CLOUD_STATE.federatedNetworks++
}

export function heartbeat(): void {
  CLOUD_STATE.lastHeartbeatAt = new Date().toISOString()
}

export function getCloudHealthScore(): number {
  const utilization = CLOUD_STATE.totalExecutionCapacity > 0
    ? CLOUD_STATE.usedExecutionCapacity / CLOUD_STATE.totalExecutionCapacity
    : 0
  const score = clampScore(100 - utilization * 50)
  CLOUD_STATE.cloudHealthScore = score
  return score
}
