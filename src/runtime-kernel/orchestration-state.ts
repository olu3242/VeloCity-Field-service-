/**
 * Orchestration State Machine — tracks workflow state transitions.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type OrchestrationPhase =
  | "initializing"
  | "running"
  | "suspended"
  | "compensating"
  | "completing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"

export interface OrchestrationState {
  stateId: string
  workflowId: string
  workflowType: string
  phase: OrchestrationPhase
  tenantId?: string
  correlationId: string
  stepIndex: number
  totalSteps: number
  checkpointAt?: string
  startedAt: string
  updatedAt: string
  completedAt?: string
  failureReason?: string
  retryCount: number
  metadata: Record<string, unknown>
}

const STATES: Map<string, OrchestrationState> = new Map()
const STATES_CAP = 2000

interface CreateOptions {
  tenantId?: string
  totalSteps?: number
  metadata?: Record<string, unknown>
}

export function createOrchestrationState(
  workflowId: string,
  workflowType: string,
  correlationId: string,
  options?: CreateOptions
): OrchestrationState {
  if (STATES.size >= STATES_CAP) {
    const firstKey = Array.from(STATES.keys())[0]
    if (firstKey !== undefined) STATES.delete(firstKey)
  }
  const state: OrchestrationState = {
    stateId: crypto.randomUUID(),
    workflowId,
    workflowType,
    phase: "initializing",
    tenantId: options?.tenantId,
    correlationId,
    stepIndex: 0,
    totalSteps: options?.totalSteps ?? 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    metadata: options?.metadata ?? {},
  }
  STATES.set(workflowId, state)
  return state
}

export function transitionState(
  workflowId: string,
  phase: OrchestrationPhase,
  metadata?: Record<string, unknown>
): OrchestrationState {
  if (isRuntimePaused() && phase !== "suspended" && phase !== "cancelled") {
    logger.warn("State transition blocked — runtime paused", "orchestration-state", {
      metadata: { workflowId, phase },
    })
  }
  const state = STATES.get(workflowId)
  if (!state) throw new Error(`No orchestration state for workflowId: ${workflowId}`)
  state.phase = phase
  state.updatedAt = new Date().toISOString()
  if (phase === "completed" || phase === "failed" || phase === "cancelled" || phase === "timed_out") {
    state.completedAt = new Date().toISOString()
  }
  if (metadata) state.metadata = { ...state.metadata, ...metadata }
  return state
}

export function advanceStep(workflowId: string): void {
  const state = STATES.get(workflowId)
  if (state) {
    state.stepIndex++
    state.updatedAt = new Date().toISOString()
  }
}

export function checkpoint(workflowId: string): void {
  const state = STATES.get(workflowId)
  if (state) {
    state.checkpointAt = new Date().toISOString()
    state.updatedAt = new Date().toISOString()
  }
}

export function getActiveStates(tenantId?: string): OrchestrationState[] {
  const active: OrchestrationPhase[] = ["initializing", "running", "suspended", "compensating", "completing"]
  return Array.from(STATES.values()).filter(
    (s) => active.includes(s.phase) && (tenantId === undefined || s.tenantId === tenantId)
  )
}

export function getOrchestrationStateSummary(): {
  total: number
  byPhase: Record<string, number>
  activeCount: number
} {
  const all = Array.from(STATES.values())
  const byPhase: Record<string, number> = {}
  for (const s of all) {
    byPhase[s.phase] = (byPhase[s.phase] ?? 0) + 1
  }
  return { total: all.length, byPhase, activeCount: getActiveStates().length }
}
