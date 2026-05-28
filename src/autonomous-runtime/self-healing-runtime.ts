import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface HealingAction {
  actionId: string
  faultType: string
  tenantId?: string
  subsystem?: string
  detectedAt: string
  healingStrategy: string
  automationLevel: "automatic" | "suggested" | "manual"
  status: "detecting" | "healing" | "healed" | "failed" | "escalated"
  durationMs?: number
  startedAt?: string
  completedAt?: string
}

const ACTIONS: HealingAction[] = []
const MAX_ACTIONS = 500

function cap(): void {
  while (ACTIONS.length > MAX_ACTIONS) ACTIONS.shift()
}

export function detectFault(
  faultType: string,
  subsystem?: string,
  tenantId?: string,
): HealingAction {
  if (isRuntimePaused()) {
    logger.warn("detectFault blocked: runtime paused", "self-healing-runtime")
  }
  const action: HealingAction = {
    actionId: crypto.randomUUID(),
    faultType,
    tenantId,
    subsystem,
    detectedAt: new Date().toISOString(),
    healingStrategy: "",
    automationLevel: "automatic",
    status: "detecting",
  }
  ACTIONS.push(action)
  cap()
  logger.info(`Fault detected: ${faultType}`, "self-healing-runtime", {
    metadata: { actionId: action.actionId, subsystem },
  })
  return action
}

export function beginHealing(
  actionId: string,
  strategy: string,
  automationLevel: HealingAction["automationLevel"],
): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.healingStrategy = strategy
  action.automationLevel = automationLevel
  action.status = "healing"
  action.startedAt = new Date().toISOString()
}

export function completeHealing(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "healed"
  action.completedAt = new Date().toISOString()
  if (action.startedAt) {
    action.durationMs =
      Date.now() - new Date(action.startedAt).getTime()
  }
}

export function failHealing(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "failed"
  action.completedAt = new Date().toISOString()
}

export function escalateHealing(actionId: string): void {
  const action = ACTIONS.find((a) => a.actionId === actionId)
  if (!action) return
  action.status = "escalated"
  action.completedAt = new Date().toISOString()
}

export function getActiveHealingActions(tenantId?: string): HealingAction[] {
  const active = ["detecting", "healing"]
  return ACTIONS.filter(
    (a) =>
      active.includes(a.status) &&
      (tenantId === undefined || a.tenantId === tenantId),
  )
}

export function getHealingSummary(): {
  total: number
  healed: number
  failed: number
  escalated: number
  autoCount: number
  avgDurationMs: number
} {
  const healed = ACTIONS.filter((a) => a.status === "healed")
  const failed = ACTIONS.filter((a) => a.status === "failed").length
  const escalated = ACTIONS.filter((a) => a.status === "escalated").length
  const autoCount = ACTIONS.filter((a) => a.automationLevel === "automatic").length
  const durations = healed.map((a) => a.durationMs ?? 0).filter((d) => d > 0)
  const avgDurationMs =
    durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0
  return {
    total: ACTIONS.length,
    healed: healed.length,
    failed,
    escalated,
    autoCount,
    avgDurationMs,
  }
}
