import { isRuntimePaused } from "@/lib/governance/operator"

export interface GovernanceOverride {
  overrideId: string
  targetActionId: string
  targetActionType: string
  tenantId?: string
  overrideType: "approve" | "deny" | "escalate" | "pause" | "emergency_stop"
  issuedBy: string
  reason: string
  appliesTo: "single" | "all_of_type"
  expiresAt?: string
  appliedAt: string
  acknowledgedAt?: string
}

const OVERRIDES: GovernanceOverride[] = []
const OVERRIDES_CAP = 500

export function issueOverride(
  actionId: string,
  actionType: string,
  type: GovernanceOverride["overrideType"],
  issuedBy: string,
  reason: string,
  appliesTo: "single" | "all_of_type" = "single",
  tenantId?: string,
  expiresAt?: string
): GovernanceOverride {
  if (isRuntimePaused()) throw new Error("Runtime is paused — governance override blocked")
  if (OVERRIDES.length >= OVERRIDES_CAP) OVERRIDES.shift()

  const override: GovernanceOverride = {
    overrideId: crypto.randomUUID(),
    targetActionId: actionId,
    targetActionType: actionType,
    tenantId,
    overrideType: type,
    issuedBy,
    reason,
    appliesTo,
    expiresAt,
    appliedAt: new Date().toISOString(),
  }

  OVERRIDES.push(override)
  return override
}

export function acknowledgeOverride(overrideId: string): void {
  const override = OVERRIDES.find((o) => o.overrideId === overrideId)
  if (!override) return
  override.acknowledgedAt = new Date().toISOString()
}

export function isOverridden(
  actionId: string,
  actionType: string
): { overridden: boolean; type?: GovernanceOverride["overrideType"] } {
  const now = new Date().toISOString()
  const match = OVERRIDES.find((o) => {
    if (o.expiresAt && o.expiresAt < now) return false
    if (o.appliesTo === "single") return o.targetActionId === actionId
    return o.targetActionType === actionType
  })
  if (!match) return { overridden: false }
  return { overridden: true, type: match.overrideType }
}

export function getActiveOverrides(tenantId?: string): GovernanceOverride[] {
  const now = new Date().toISOString()
  return OVERRIDES.filter(
    (o) =>
      (!o.expiresAt || o.expiresAt >= now) &&
      (tenantId === undefined || o.tenantId === tenantId)
  )
}

export function getOverrideSummary(): {
  total: number
  byType: Record<string, number>
  activeCount: number
} {
  const byType: Record<string, number> = {}
  for (const o of OVERRIDES) {
    byType[o.overrideType] = (byType[o.overrideType] ?? 0) + 1
  }
  const activeCount = getActiveOverrides().length
  return { total: OVERRIDES.length, byType, activeCount }
}
