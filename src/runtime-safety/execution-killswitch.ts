import { isRuntimePaused } from "@/lib/governance/operator"

export type KillswitchScope =
  | "single_execution"
  | "workflow_type"
  | "tenant"
  | "region"
  | "global"

export interface KillswitchActivation {
  activationId: string
  scope: KillswitchScope
  targetId: string
  reason: string
  activatedBy: string
  tenantId?: string
  active: boolean
  activatedAt: string
  deactivatedAt?: string
  deactivatedBy?: string
}

const ACTIVATIONS: KillswitchActivation[] = []
const ACTIVATIONS_CAP = 200

export function activate(
  scope: KillswitchScope,
  targetId: string,
  reason: string,
  activatedBy: string,
  tenantId?: string
): KillswitchActivation {
  if (isRuntimePaused()) throw new Error("Runtime is paused — killswitch activation blocked")
  if (ACTIVATIONS.length >= ACTIVATIONS_CAP) ACTIVATIONS.shift()

  const activation: KillswitchActivation = {
    activationId: crypto.randomUUID(),
    scope,
    targetId,
    reason,
    activatedBy,
    tenantId,
    active: true,
    activatedAt: new Date().toISOString(),
  }

  ACTIVATIONS.push(activation)
  return activation
}

export function deactivate(activationId: string, deactivatedBy: string): void {
  const activation = ACTIVATIONS.find((a) => a.activationId === activationId)
  if (!activation) return
  activation.active = false
  activation.deactivatedAt = new Date().toISOString()
  activation.deactivatedBy = deactivatedBy
}

export function isKilled(scope: KillswitchScope, targetId: string): boolean {
  return ACTIVATIONS.some(
    (a) =>
      a.active &&
      ((a.scope === scope && a.targetId === targetId) || a.scope === "global")
  )
}

export function getActiveKillswitches(): KillswitchActivation[] {
  return ACTIVATIONS.filter((a) => a.active)
}

export function getKillswitchSummary(): {
  total: number
  active: number
  byScope: Record<string, number>
} {
  const byScope: Record<string, number> = {}
  for (const a of ACTIVATIONS) {
    byScope[a.scope] = (byScope[a.scope] ?? 0) + 1
  }
  const active = ACTIVATIONS.filter((a) => a.active).length
  return { total: ACTIVATIONS.length, active, byScope }
}
