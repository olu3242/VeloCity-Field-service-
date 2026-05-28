import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type FabricAdaptationMode =
  | "stable"
  | "adapting"
  | "scaling"
  | "rebalancing"
  | "recovering"

export interface AdaptiveFabricState {
  fabricId: string
  mode: FabricAdaptationMode
  adaptationCycles: number
  lastAdaptationAt?: string
  autonomyLevel: number
  healthScore: number
  totalAdaptations: number
  successfulAdaptations: number
  startedAt: string
}

const FABRIC_STATE: AdaptiveFabricState = {
  fabricId: crypto.randomUUID(),
  mode: "stable",
  adaptationCycles: 0,
  autonomyLevel: 0.5,
  healthScore: 100,
  totalAdaptations: 0,
  successfulAdaptations: 0,
  startedAt: new Date().toISOString(),
}

export function getFabricState(): AdaptiveFabricState {
  return { ...FABRIC_STATE }
}

export function setAdaptationMode(mode: FabricAdaptationMode): void {
  if (isRuntimePaused()) {
    logger.warn("setAdaptationMode blocked: runtime paused", "adaptive-fabric")
    return
  }
  FABRIC_STATE.mode = mode
  FABRIC_STATE.adaptationCycles += 1
  FABRIC_STATE.lastAdaptationAt = new Date().toISOString()
  logger.info(`Fabric mode set to ${mode}`, "adaptive-fabric")
}

export function recordAdaptation(success: boolean): void {
  FABRIC_STATE.totalAdaptations += 1
  if (success) FABRIC_STATE.successfulAdaptations += 1
}

export function setAutonomyLevel(level: number): void {
  if (isRuntimePaused()) {
    logger.warn("setAutonomyLevel blocked: runtime paused", "adaptive-fabric")
    return
  }
  FABRIC_STATE.autonomyLevel = Math.max(0, Math.min(1, level))
}

export function getFabricHealth(): number {
  switch (FABRIC_STATE.mode) {
    case "stable":
      return 100
    case "adapting":
    case "scaling":
      return 75
    case "rebalancing":
      return 50
    case "recovering":
      return 25
  }
}
