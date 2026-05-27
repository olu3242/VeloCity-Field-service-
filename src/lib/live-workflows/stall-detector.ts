/**
 * Stall Detector — detects workflow steps that have stalled.
 * In-memory singleton with rolling cap of 200 stall events.
 */

import { getActiveTraces } from "./workflow-tracer"

const STALLS_CAP = 200
const STALL_THRESHOLD_MS = 30_000

export interface StallEvent {
  id: string
  traceId: string
  workflowType: string
  tenantId: string
  stalledStep: string
  stallDurationMs: number
  severity: "warning" | "critical"
  detectedAt: string
  resolved: boolean
}

const STALLS: StallEvent[] = []

function enforceCap(): void {
  while (STALLS.length > STALLS_CAP) STALLS.shift()
}

export function detectStalls(): StallEvent[] {
  const now = Date.now()
  const newStalls: StallEvent[] = []

  for (const trace of getActiveTraces()) {
    for (const step of trace.steps) {
      if (step.status !== "running") continue
      const stepStart = new Date(step.startedAt).getTime()
      const stallDurationMs = now - stepStart
      if (stallDurationMs <= STALL_THRESHOLD_MS) continue

      const existing = STALLS.find(
        (s) => s.traceId === trace.id && s.stalledStep === step.name && !s.resolved
      )
      if (existing) continue

      const stall: StallEvent = {
        id: crypto.randomUUID(),
        traceId: trace.id,
        workflowType: trace.workflowType,
        tenantId: trace.tenantId,
        stalledStep: step.name,
        stallDurationMs,
        severity: stallDurationMs > 120_000 ? "critical" : "warning",
        detectedAt: new Date().toISOString(),
        resolved: false,
      }
      STALLS.push(stall)
      enforceCap()
      newStalls.push(stall)
    }
  }
  return newStalls
}

export function resolveStall(id: string): void {
  const stall = STALLS.find((s) => s.id === id)
  if (stall) stall.resolved = true
}

export function getActiveStalls(tenantId?: string): StallEvent[] {
  const active = STALLS.filter((s) => !s.resolved)
  if (tenantId) return active.filter((s) => s.tenantId === tenantId)
  return active
}

export function getStallStats(): {
  total: number
  active: number
  avgStallMs: number
} {
  const active = getActiveStalls()
  const avgStallMs =
    STALLS.length > 0
      ? STALLS.reduce((s, st) => s + st.stallDurationMs, 0) / STALLS.length
      : 0
  return { total: STALLS.length, active: active.length, avgStallMs }
}
