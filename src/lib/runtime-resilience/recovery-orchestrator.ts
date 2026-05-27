/**
 * Recovery Orchestrator — manages runtime recovery actions.
 * In-memory singleton with rolling cap of 200 entries.
 */

import { isRuntimePaused } from "@/lib/governance/operator"

const ACTIONS_CAP = 200

export interface RecoveryAction {
  id: string
  component: string
  tenantId?: string
  actionType: "restart" | "failover" | "circuit_trip" | "queue_drain" | "scale_up"
  trigger: string
  status: "pending" | "executing" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  outcome?: string
}

const ACTIONS: RecoveryAction[] = []

function enforceCap(): void {
  while (ACTIONS.length > ACTIONS_CAP) ACTIONS.shift()
}

export function initiateRecovery(
  component: string,
  actionType: RecoveryAction["actionType"],
  trigger: string,
  tenantId?: string
): RecoveryAction {
  if (isRuntimePaused()) {
    const blocked: RecoveryAction = {
      id: crypto.randomUUID(),
      component,
      tenantId,
      actionType,
      trigger,
      status: "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "blocked: runtime paused",
    }
    ACTIONS.push(blocked)
    enforceCap()
    return blocked
  }
  const action: RecoveryAction = {
    id: crypto.randomUUID(),
    component,
    tenantId,
    actionType,
    trigger,
    status: "pending",
    startedAt: new Date().toISOString(),
  }
  ACTIONS.push(action)
  enforceCap()
  return action
}

export function completeRecovery(id: string, outcome: string): void {
  const action = ACTIONS.find((a) => a.id === id)
  if (!action) return
  action.status = "completed"
  action.completedAt = new Date().toISOString()
  action.outcome = outcome
}

export function failRecovery(id: string, reason: string): void {
  const action = ACTIONS.find((a) => a.id === id)
  if (!action) return
  action.status = "failed"
  action.completedAt = new Date().toISOString()
  action.outcome = reason
}

export function getActiveRecoveries(): RecoveryAction[] {
  return ACTIONS.filter((a) => a.status === "pending" || a.status === "executing")
}

export function getRecoveryStats(): {
  total: number
  successRate: number
  avgDurationMs: number
  byActionType: Record<string, number>
} {
  const completed = ACTIONS.filter((a) => a.status === "completed" || a.status === "failed")
  const succeeded = ACTIONS.filter((a) => a.status === "completed").length
  const successRate = completed.length > 0 ? succeeded / completed.length : 0

  const withDuration = ACTIONS.filter((a) => a.completedAt !== undefined)
  const avgDurationMs =
    withDuration.length > 0
      ? withDuration.reduce((sum, a) => {
          const dur = new Date(a.completedAt!).getTime() - new Date(a.startedAt).getTime()
          return sum + dur
        }, 0) / withDuration.length
      : 0

  const byActionType: Record<string, number> = {}
  for (const a of ACTIONS) {
    byActionType[a.actionType] = (byActionType[a.actionType] ?? 0) + 1
  }

  return { total: ACTIONS.length, successRate, avgDurationMs, byActionType }
}
