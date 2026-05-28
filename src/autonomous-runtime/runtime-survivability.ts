import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface SurvivabilityAction {
  actionId: string
  threatType: string
  tenantId?: string
  affectedRegions: string[]
  survivabilityStrategy:
    | "failover"
    | "degraded_mode"
    | "load_shed"
    | "emergency_stop"
    | "region_isolate"
  estimatedImpact: string
  autonomouslyTriggered: boolean
  status: "activating" | "active" | "resolved" | "failed"
  activatedAt: string
  resolvedAt?: string
}

const ACTIONS: SurvivabilityAction[] = []
const MAX_ACTIONS = 200

function cap(): void {
  while (ACTIONS.length > MAX_ACTIONS) ACTIONS.shift()
}

export function activateSurvivability(
  threatType: string,
  strategy: SurvivabilityAction["survivabilityStrategy"],
  affectedRegions: string[],
  tenantId?: string,
  autonomous?: boolean,
): SurvivabilityAction {
  if (isRuntimePaused()) {
    logger.warn(
      "activateSurvivability blocked: runtime paused",
      "runtime-survivability",
    )
  }
  const action: SurvivabilityAction = {
    actionId: crypto.randomUUID(),
    threatType,
    tenantId,
    affectedRegions: [...affectedRegions],
    survivabilityStrategy: strategy,
    estimatedImpact: `${strategy} applied to ${affectedRegions.join(", ")}`,
    autonomouslyTriggered: autonomous ?? true,
    status: "activating",
    activatedAt: new Date().toISOString(),
  }
  ACTIONS.push(action)
  cap()
  logger.warn(
    `Survivability activated: ${threatType} — ${strategy}`,
    "runtime-survivability",
    { metadata: { actionId: action.actionId, affectedRegions } },
  )
  return action
}

export function resolveThreact(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "resolved"
  a.resolvedAt = new Date().toISOString()
}

export function failAction(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "failed"
}

export function getActiveThreats(): SurvivabilityAction[] {
  return ACTIONS.filter(
    (a) => a.status === "activating" || a.status === "active",
  )
}

export function getSurvivabilitySummary(): {
  total: number
  active: number
  resolved: number
  failed: number
  byStrategy: Record<string, number>
} {
  const active = ACTIONS.filter(
    (a) => a.status === "activating" || a.status === "active",
  ).length
  const resolved = ACTIONS.filter((a) => a.status === "resolved").length
  const failed = ACTIONS.filter((a) => a.status === "failed").length
  const byStrategy: Record<string, number> = {}
  for (const a of ACTIONS) {
    byStrategy[a.survivabilityStrategy] =
      (byStrategy[a.survivabilityStrategy] ?? 0) + 1
  }
  return { total: ACTIONS.length, active, resolved, failed, byStrategy }
}
