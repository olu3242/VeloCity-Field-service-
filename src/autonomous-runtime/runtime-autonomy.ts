import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { type AutonomyAction } from "./autonomous-runtime"

export interface AutonomyBoundary {
  boundaryId: string
  actionType: AutonomyAction
  tenantId?: string
  maxAutonomousMagnitude: number
  requiresApprovalAbove: number
  cooldownMs: number
  lastExecutedAt?: string
  executionCount: number
}

const BOUNDARIES: Map<string, AutonomyBoundary> = new Map()
const MAX_BOUNDARIES = 200

function cap(): void {
  if (BOUNDARIES.size > MAX_BOUNDARIES) {
    const firstKey = Array.from(BOUNDARIES.keys())[0]
    if (firstKey !== undefined) BOUNDARIES.delete(firstKey)
  }
}

export function registerBoundary(
  actionType: AutonomyAction,
  maxMagnitude: number,
  requiresApproval: number,
  cooldownMs: number,
  tenantId?: string,
): AutonomyBoundary {
  if (isRuntimePaused()) {
    logger.warn("registerBoundary blocked: runtime paused", "runtime-autonomy")
  }
  const boundary: AutonomyBoundary = {
    boundaryId: crypto.randomUUID(),
    actionType,
    tenantId,
    maxAutonomousMagnitude: maxMagnitude,
    requiresApprovalAbove: requiresApproval,
    cooldownMs,
    executionCount: 0,
  }
  BOUNDARIES.set(actionType, boundary)
  cap()
  logger.info(`Boundary registered: ${actionType}`, "runtime-autonomy", {
    metadata: { boundaryId: boundary.boundaryId, maxMagnitude },
  })
  return boundary
}

export function checkBoundary(
  actionType: AutonomyAction,
  magnitude: number,
): { allowed: boolean; requiresApproval: boolean; reason?: string } {
  const boundary = BOUNDARIES.get(actionType)
  if (!boundary) {
    return { allowed: false, requiresApproval: false, reason: "No boundary registered" }
  }
  if (boundary.lastExecutedAt) {
    const elapsed = Date.now() - new Date(boundary.lastExecutedAt).getTime()
    if (elapsed < boundary.cooldownMs) {
      return { allowed: false, requiresApproval: false, reason: "In cooldown period" }
    }
  }
  if (magnitude > boundary.requiresApprovalAbove) {
    return { allowed: true, requiresApproval: true, reason: "Magnitude exceeds approval threshold" }
  }
  if (magnitude <= boundary.maxAutonomousMagnitude) {
    return { allowed: true, requiresApproval: false }
  }
  return { allowed: false, requiresApproval: false, reason: "Magnitude exceeds max autonomous limit" }
}

export function recordExecution(actionType: AutonomyAction): void {
  const boundary = BOUNDARIES.get(actionType)
  if (!boundary) return
  boundary.lastExecutedAt = new Date().toISOString()
  boundary.executionCount++
}

export function getBoundaries(actionType?: AutonomyAction): AutonomyBoundary[] {
  if (actionType !== undefined) {
    const b = BOUNDARIES.get(actionType)
    return b ? [b] : []
  }
  return Array.from(BOUNDARIES.values())
}

export function getBoundarySummary(): {
  total: number
  byAction: Record<string, number>
} {
  const byAction: Record<string, number> = {}
  for (const b of Array.from(BOUNDARIES.values())) {
    byAction[b.actionType] = (byAction[b.actionType] ?? 0) + 1
  }
  return { total: BOUNDARIES.size, byAction }
}

const DEFAULT_ACTIONS: AutonomyAction[] = [
  "remediate",
  "optimize",
  "scale",
  "rebalance",
  "rollback",
  "escalate",
]

for (const action of DEFAULT_ACTIONS) {
  registerBoundary(action, 70, 85, 30_000)
}
