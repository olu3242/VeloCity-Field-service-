import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type CognitionCommand =
  | "pause_learning"
  | "resume_learning"
  | "force_evolution"
  | "reset_cognition"
  | "sync_mesh"
  | "escalate_autonomy"
  | "reduce_autonomy"

export interface CognitionControlAction {
  actionId: string
  command: CognitionCommand
  issuedBy: string
  tenantId?: string
  targetNodeId?: string
  status: "pending" | "executing" | "completed" | "failed"
  issuedAt: string
  completedAt?: string
  error?: string
}

const ACTIONS: CognitionControlAction[] = []
const MAX_ACTIONS = 500

function cap(): void {
  while (ACTIONS.length > MAX_ACTIONS) ACTIONS.shift()
}

export function issueCommand(
  command: CognitionCommand,
  issuedBy: string,
  targetNodeId?: string,
  tenantId?: string,
): CognitionControlAction {
  if (isRuntimePaused()) {
    logger.warn(
      `issueCommand(${command}) blocked: runtime paused`,
      "cognition-control-plane",
    )
  }
  const action: CognitionControlAction = {
    actionId: crypto.randomUUID(),
    command,
    issuedBy,
    tenantId,
    targetNodeId,
    status: "pending",
    issuedAt: new Date().toISOString(),
  }
  ACTIONS.push(action)
  cap()
  logger.info(
    `Cognition command issued: ${command}`,
    "cognition-control-plane",
    { metadata: { actionId: action.actionId, issuedBy } },
  )
  return action
}

export function executeAction(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "executing"
}

export function completeAction(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "completed"
  a.completedAt = new Date().toISOString()
}

export function failAction(actionId: string, error?: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "failed"
  a.completedAt = new Date().toISOString()
  if (error !== undefined) a.error = error
}

export function getCommandHistory(
  command?: CognitionCommand,
): CognitionControlAction[] {
  return ACTIONS.filter((a) => command === undefined || a.command === command)
}

export function getControlPlaneSummary(): {
  total: number
  byCommand: Record<string, number>
  byStatus: Record<string, number>
} {
  const byCommand: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const a of ACTIONS) {
    byCommand[a.command] = (byCommand[a.command] ?? 0) + 1
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  }
  return { total: ACTIONS.length, byCommand, byStatus }
}
