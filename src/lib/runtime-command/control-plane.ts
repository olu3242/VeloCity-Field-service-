/**
 * Control Plane — unified view and control over the runtime.
 */

import { isRuntimePaused, getOperatorState } from "@/lib/governance/operator"
import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { getDegradedSystems } from "@/lib/runtime-state/state-registry"
import { getActiveRecoveries } from "@/lib/runtime-resilience/recovery-orchestrator"
import { issueCommand, getPendingCommands, getCommandHistory } from "./command-bus"

export interface ControlPlaneStatus {
  runtimePaused: boolean
  activeCommands: number
  pendingRecoveries: number
  openCircuits: number
  degradedComponents: number
  lastCommandAt?: string
  operatorId?: string
}

export function getControlPlaneStatus(): ControlPlaneStatus {
  const circuits = getAllCircuits()
  const openCircuits = circuits.filter((c) => c.state === "open").length
  const degradedComponents = getDegradedSystems().length
  const pendingRecoveries = getActiveRecoveries().length
  const pending = getPendingCommands()
  const history = getCommandHistory(1)
  const lastCommandAt = history.length > 0 ? history[0]?.issuedAt : undefined
  const opState = getOperatorState()

  return {
    runtimePaused: isRuntimePaused(),
    activeCommands: pending.length,
    pendingRecoveries,
    openCircuits,
    degradedComponents,
    lastCommandAt,
    operatorId: opState.pausedBy ?? undefined,
  }
}

export async function pauseRuntime(operatorId: string, reason: string): Promise<void> {
  const cmd = issueCommand("pause_runtime", operatorId, { reason })
  const { emitEvent } = await import("@/lib/automation/emitEvent")
  await emitEvent("runtime.paused", { commandId: cmd.id, operatorId, reason })
}

export async function resumeRuntime(operatorId: string): Promise<void> {
  const cmd = issueCommand("resume_runtime", operatorId)
  const { emitEvent } = await import("@/lib/automation/emitEvent")
  await emitEvent("runtime.resumed", { commandId: cmd.id, operatorId })
}

export function getOperationalMode(): "normal" | "degraded" | "maintenance" | "emergency" {
  if (isRuntimePaused()) return "maintenance"
  const status = getControlPlaneStatus()
  if (status.openCircuits > 3 || status.degradedComponents > 5) return "emergency"
  if (status.openCircuits > 0 || status.degradedComponents > 0) return "degraded"
  return "normal"
}
