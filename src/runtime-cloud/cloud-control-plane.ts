import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ControlPlaneCommand =
  | "scale_up" | "scale_down" | "drain_region" | "failover_region"
  | "pause_tenant" | "resume_tenant" | "evict_execution" | "rebalance"

export interface ControlPlaneAction {
  actionId: string
  command: ControlPlaneCommand
  targetRegion?: string
  targetTenantId?: string
  targetExecutionId?: string
  issuedBy: string
  issuedAt: string
  status: "pending" | "executing" | "completed" | "failed"
  completedAt?: string
  error?: string
}

const ACTIONS: ControlPlaneAction[] = []
const ACTIONS_CAP = 1000

export function issueCommand(
  command: ControlPlaneCommand,
  issuedBy: string,
  options?: {
    targetRegion?: string
    targetTenantId?: string
    targetExecutionId?: string
  },
): ControlPlaneAction {
  if (isRuntimePaused()) {
    logger.warn("issueCommand blocked: runtime is paused", "cloud-control-plane", {
      metadata: { command, issuedBy },
    })
    throw new Error("Runtime is paused — control plane command blocked")
  }
  if (ACTIONS.length >= ACTIONS_CAP) ACTIONS.shift()

  const action: ControlPlaneAction = {
    actionId: crypto.randomUUID(),
    command,
    targetRegion: options?.targetRegion,
    targetTenantId: options?.targetTenantId,
    targetExecutionId: options?.targetExecutionId,
    issuedBy,
    issuedAt: new Date().toISOString(),
    status: "pending",
  }
  ACTIONS.push(action)
  logger.info("Control plane command issued", "cloud-control-plane", {
    metadata: { actionId: action.actionId, command, issuedBy },
  })
  return action
}

export function executeAction(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "executing"
}

export function completeAction(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "completed"
  action.completedAt = new Date().toISOString()
}

export function failAction(actionId: string, error: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "failed"
  action.error = error
  action.completedAt = new Date().toISOString()
}

export function getActionHistory(command?: ControlPlaneCommand): ControlPlaneAction[] {
  return command ? ACTIONS.filter((a) => a.command === command) : [...ACTIONS]
}

export function getControlPlaneSummary(): {
  total: number
  pending: number
  executing: number
  completed: number
  failed: number
  byCommand: Record<string, number>
} {
  const byCommand: Record<string, number> = {}
  let pending = 0, executing = 0, completed = 0, failed = 0
  for (const a of ACTIONS) {
    byCommand[a.command] = (byCommand[a.command] ?? 0) + 1
    if (a.status === "pending") pending++
    else if (a.status === "executing") executing++
    else if (a.status === "completed") completed++
    else failed++
  }
  return { total: ACTIONS.length, pending, executing, completed, failed, byCommand }
}
