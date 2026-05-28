import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type FabricMode = "active" | "degraded" | "partitioned" | "recovering" | "readonly"

export interface FabricState {
  fabricId: string
  mode: FabricMode
  regionCount: number
  activePartitions: number
  totalCapacity: number
  usedCapacity: number
  routingTableVersion: number
  startedAt: string
  lastHeartbeatAt: string
  healthScore: number
}

const FABRIC_STATE: FabricState = {
  fabricId: crypto.randomUUID(),
  mode: "active",
  regionCount: 0,
  activePartitions: 0,
  totalCapacity: 1000,
  usedCapacity: 0,
  routingTableVersion: 1,
  startedAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
  healthScore: 100,
}

export function getFabricState(): FabricState {
  return { ...FABRIC_STATE }
}

export function setFabricMode(mode: FabricMode): void {
  if (isRuntimePaused()) {
    logger.warn("setFabricMode blocked: runtime is paused", "fabric-kernel", { metadata: { mode } })
    return
  }
  FABRIC_STATE.mode = mode
  FABRIC_STATE.healthScore = getFabricHealthScore()
  logger.info(`Fabric mode set to ${mode}`, "fabric-kernel", { metadata: { fabricId: FABRIC_STATE.fabricId } })
}

export function reportCapacityUsage(delta: number): void {
  FABRIC_STATE.usedCapacity = Math.max(0, FABRIC_STATE.usedCapacity + delta)
  FABRIC_STATE.healthScore = getFabricHealthScore()
}

export function heartbeat(): void {
  FABRIC_STATE.lastHeartbeatAt = new Date().toISOString()
  FABRIC_STATE.healthScore = getFabricHealthScore()
  logger.debug("Fabric heartbeat", "fabric-kernel", { metadata: { fabricId: FABRIC_STATE.fabricId } })
}

export function getFabricHealthScore(): number {
  switch (FABRIC_STATE.mode) {
    case "active": return 100
    case "degraded": return 60
    case "partitioned": return 20
    case "recovering": return 20
    case "readonly": return 50
    default: return 0
  }
}

export function updateFabricRegionCount(count: number): void {
  FABRIC_STATE.regionCount = count
}

export function updateActivePartitions(count: number): void {
  FABRIC_STATE.activePartitions = count
  FABRIC_STATE.routingTableVersion += 1
}
