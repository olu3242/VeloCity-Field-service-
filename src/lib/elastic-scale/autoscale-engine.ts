import { isRuntimePaused } from "@/lib/governance/operator"

export interface AutoscaleEvent {
  id: string
  resourceType: string
  fromLevel: number
  toLevel: number
  trigger: string
  status: "pending" | "scaling" | "complete" | "failed"
  initiatedAt: string
  completedAt?: string
}

const EVENTS: AutoscaleEvent[] = []
const EVENTS_CAP = 100

export function initiateScale(
  resourceType: string,
  fromLevel: number,
  toLevel: number,
  trigger: string,
): AutoscaleEvent {
  if (isRuntimePaused()) {
    throw new Error("Runtime is paused — scaling blocked")
  }
  const event: AutoscaleEvent = {
    id: crypto.randomUUID(),
    resourceType,
    fromLevel,
    toLevel,
    trigger,
    status: "pending",
    initiatedAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  if (EVENTS.length > EVENTS_CAP) EVENTS.splice(0, EVENTS.length - EVENTS_CAP)
  return event
}

export function completeScale(id: string, status: "complete" | "failed"): void {
  const event = EVENTS.find((e) => e.id === id)
  if (!event) return
  event.status = status
  event.completedAt = new Date().toISOString()
}

export function getActiveScalingOps(): AutoscaleEvent[] {
  return EVENTS.filter((e) => e.status === "pending" || e.status === "scaling")
}

export function getScaleHistory(resourceType?: string): AutoscaleEvent[] {
  return resourceType ? EVENTS.filter((e) => e.resourceType === resourceType) : [...EVENTS]
}

export function getScalingSummary(): { totalEvents: number; successRate: number; avgScaleTimeMs: number } {
  const done = EVENTS.filter((e) => e.status === "complete" || e.status === "failed")
  const succeeded = done.filter((e) => e.status === "complete")
  const successRate = done.length > 0 ? succeeded.length / done.length : 0
  const withTime = EVENTS.filter((e) => e.completedAt)
  const avgScaleTimeMs = withTime.length > 0
    ? withTime.reduce((s, e) => s + (new Date(e.completedAt!).getTime() - new Date(e.initiatedAt).getTime()), 0) / withTime.length
    : 0
  return { totalEvents: EVENTS.length, successRate, avgScaleTimeMs }
}
