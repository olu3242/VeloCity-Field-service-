import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type RecoveryMode = "passive" | "active" | "aggressive" | "emergency"

export interface RecoveryAction {
  actionId: string
  executionId: string
  tenantId?: string
  mode: RecoveryMode
  trigger: string
  steps: string[]
  attemptNumber: number
  maxAttempts: number
  status: "queued" | "executing" | "succeeded" | "failed" | "exhausted"
  queuedAt: string
  startedAt?: string
  completedAt?: string
}

const ACTIONS: RecoveryAction[] = []
const ACTIONS_CAP = 500

let RECOVERY_MODE: RecoveryMode = "passive"

export function setRecoveryMode(mode: RecoveryMode): void {
  if (isRuntimePaused()) {
    logger.warn("setRecoveryMode blocked: runtime paused")
    return
  }
  RECOVERY_MODE = mode
}

export function getRecoveryMode(): RecoveryMode {
  return RECOVERY_MODE
}

export function initiateRecovery(
  executionId: string,
  trigger: string,
  steps: string[],
  maxAttempts = 3,
  tenantId?: string
): RecoveryAction {
  if (isRuntimePaused()) {
    logger.warn("initiateRecovery blocked: runtime paused")
    throw new Error("Runtime is paused")
  }
  const action: RecoveryAction = {
    actionId: crypto.randomUUID(),
    executionId,
    tenantId,
    mode: RECOVERY_MODE,
    trigger,
    steps,
    attemptNumber: 1,
    maxAttempts,
    status: "queued",
    queuedAt: new Date().toISOString(),
  }
  ACTIONS.push(action)
  if (ACTIONS.length > ACTIONS_CAP) ACTIONS.splice(0, ACTIONS.length - ACTIONS_CAP)
  return action
}

export function startRecovery(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "executing"
  action.startedAt = new Date().toISOString()
}

export function completeRecovery(actionId: string, succeeded: boolean): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.completedAt = new Date().toISOString()
  if (succeeded) {
    action.status = "succeeded"
  } else {
    if (action.attemptNumber < action.maxAttempts) {
      action.attemptNumber++
      action.status = "failed"
    } else {
      action.status = "exhausted"
    }
  }
}

export function getActiveRecoveries(): RecoveryAction[] {
  return ACTIONS.filter((a) => a.status === "queued" || a.status === "executing")
}

export function getRecoverySummary(): {
  total: number
  succeeded: number
  failed: number
  exhausted: number
  avgAttempts: number
} {
  const total = ACTIONS.length
  const succeeded = ACTIONS.filter((a) => a.status === "succeeded").length
  const failed = ACTIONS.filter((a) => a.status === "failed").length
  const exhausted = ACTIONS.filter((a) => a.status === "exhausted").length
  const avgAttempts = total > 0 ? ACTIONS.reduce((s, a) => s + a.attemptNumber, 0) / total : 0
  return { total, succeeded, failed, exhausted, avgAttempts }
}
