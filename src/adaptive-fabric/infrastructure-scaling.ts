import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ScalingDirection = "up" | "down" | "out" | "in"
export type ScalingTrigger = "predictive" | "reactive" | "scheduled" | "operator"

export interface ScalingEvent {
  eventId: string
  direction: ScalingDirection
  trigger: ScalingTrigger
  tenantId?: string
  region?: string
  currentCapacity: number
  targetCapacity: number
  reason: string
  status: "planned" | "executing" | "completed" | "failed"
  plannedAt: string
  executedAt?: string
  completedAt?: string
}

const SCALING_EVENTS: ScalingEvent[] = []
const CAP = 500

export function planScaling(
  direction: ScalingDirection,
  trigger: ScalingTrigger,
  current: number,
  target: number,
  reason: string,
  region?: string,
  tenantId?: string
): ScalingEvent {
  if (isRuntimePaused()) {
    logger.warn("planScaling blocked: runtime paused", "infrastructure-scaling")
    throw new Error("Runtime is paused")
  }
  if (SCALING_EVENTS.length >= CAP) SCALING_EVENTS.shift()
  const event: ScalingEvent = {
    eventId: crypto.randomUUID(),
    direction,
    trigger,
    tenantId,
    region,
    currentCapacity: current,
    targetCapacity: target,
    reason,
    status: "planned",
    plannedAt: new Date().toISOString(),
  }
  SCALING_EVENTS.push(event)
  return event
}

function findById(id: string): ScalingEvent | undefined {
  return SCALING_EVENTS.find(e => e.eventId === id)
}

export function executeScaling(eventId: string): void {
  const e = findById(eventId)
  if (e) { e.status = "executing"; e.executedAt = new Date().toISOString() }
}

export function completeScaling(eventId: string): void {
  const e = findById(eventId)
  if (e) { e.status = "completed"; e.completedAt = new Date().toISOString() }
}

export function failScaling(eventId: string): void {
  const e = findById(eventId)
  if (e) e.status = "failed"
}

export function getScalingHistory(region?: string): ScalingEvent[] {
  return region ? SCALING_EVENTS.filter(e => e.region === region) : [...SCALING_EVENTS]
}

export function getScalingSummary(): {
  total: number
  byDirection: Record<string, number>
  byTrigger: Record<string, number>
  avgCapacityDelta: number
} {
  const byDirection: Record<string, number> = {}
  const byTrigger: Record<string, number> = {}
  let totalDelta = 0
  for (const e of SCALING_EVENTS) {
    byDirection[e.direction] = (byDirection[e.direction] ?? 0) + 1
    byTrigger[e.trigger] = (byTrigger[e.trigger] ?? 0) + 1
    totalDelta += Math.abs(e.targetCapacity - e.currentCapacity)
  }
  return {
    total: SCALING_EVENTS.length,
    byDirection,
    byTrigger,
    avgCapacityDelta: SCALING_EVENTS.length > 0 ? totalDelta / SCALING_EVENTS.length : 0,
  }
}
