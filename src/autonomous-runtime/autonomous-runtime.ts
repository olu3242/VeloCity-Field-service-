import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type AutonomyMode =
  | "supervised"
  | "assisted"
  | "semi_autonomous"
  | "autonomous"
  | "emergency_manual"

export type AutonomyAction =
  | "remediate"
  | "optimize"
  | "scale"
  | "rebalance"
  | "rollback"
  | "escalate"

export interface AutonomousRuntimeState {
  runtimeId: string
  autonomyMode: AutonomyMode
  totalAutonomousActions: number
  successfulActions: number
  rolledBackActions: number
  autonomyScore: number
  lastActionAt?: string
  governancePoliciesActive: number
  startedAt: string
}

const RUNTIME_STATE: AutonomousRuntimeState = {
  runtimeId: crypto.randomUUID(),
  autonomyMode: "supervised",
  totalAutonomousActions: 0,
  successfulActions: 0,
  rolledBackActions: 0,
  autonomyScore: 100,
  governancePoliciesActive: 0,
  startedAt: new Date().toISOString(),
}

export function getRuntimeState(): AutonomousRuntimeState {
  return { ...RUNTIME_STATE }
}

export function setAutonomyMode(mode: AutonomyMode): void {
  if (isRuntimePaused()) {
    logger.warn("setAutonomyMode blocked: runtime paused", "autonomous-runtime")
    return
  }
  RUNTIME_STATE.autonomyMode = mode
  logger.info(`Autonomy mode set to ${mode}`, "autonomous-runtime", {
    metadata: { runtimeId: RUNTIME_STATE.runtimeId, mode },
  })
}

export function recordAction(success: boolean, rolledBack?: boolean): void {
  RUNTIME_STATE.totalAutonomousActions++
  RUNTIME_STATE.lastActionAt = new Date().toISOString()
  if (success) RUNTIME_STATE.successfulActions++
  if (rolledBack) RUNTIME_STATE.rolledBackActions++
  RUNTIME_STATE.autonomyScore = getAutonomyScore()
}

export function getAutonomyScore(): number {
  const ratio =
    RUNTIME_STATE.successfulActions /
    Math.max(1, RUNTIME_STATE.totalAutonomousActions)
  return clampScore(ratio * 100)
}
