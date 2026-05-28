import { type AwarenessLevel } from "./operational-awareness"

export interface ConsciousnessTransition {
  transitionId: string
  fromLevel: AwarenessLevel
  toLevel: AwarenessLevel
  trigger: string
  tenantId?: string
  transitionedAt: string
  durationAtPreviousLevel?: number
  resolved: boolean
}

const TRANSITIONS: ConsciousnessTransition[] = []
const CAP = 1000

const levelStartTimes: Map<AwarenessLevel, number> = new Map()

export function recordTransition(
  from: AwarenessLevel,
  to: AwarenessLevel,
  trigger: string,
  tenantId?: string
): ConsciousnessTransition {
  if (TRANSITIONS.length >= CAP) TRANSITIONS.shift()

  const now = Date.now()
  const startTime = levelStartTimes.get(from)
  const durationAtPreviousLevel =
    startTime !== undefined ? now - startTime : undefined

  levelStartTimes.set(to, now)

  const transition: ConsciousnessTransition = {
    transitionId: crypto.randomUUID(),
    fromLevel: from,
    toLevel: to,
    trigger,
    tenantId,
    transitionedAt: new Date(now).toISOString(),
    durationAtPreviousLevel,
    resolved: false,
  }
  TRANSITIONS.push(transition)
  return transition
}

export function resolveTransition(transitionId: string): void {
  const t = TRANSITIONS.find(x => x.transitionId === transitionId)
  if (t) t.resolved = true
}

export function getTransitionHistory(
  tenantId?: string,
  limit?: number
): ConsciousnessTransition[] {
  let results = tenantId
    ? TRANSITIONS.filter(t => t.tenantId === tenantId)
    : [...TRANSITIONS]
  if (limit !== undefined) results = results.slice(-limit)
  return results
}

export function getCrisisPeriods(): ConsciousnessTransition[] {
  return TRANSITIONS.filter(t => t.toLevel === "crisis")
}

export function getLineageSummary(): {
  total: number
  crisisCount: number
  avgDurationMs: number
  byTransition: Record<string, number>
} {
  const byTransition: Record<string, number> = {}
  let totalDuration = 0
  let durationCount = 0

  for (const t of TRANSITIONS) {
    const key = `${t.fromLevel}->${t.toLevel}`
    byTransition[key] = (byTransition[key] ?? 0) + 1
    if (t.durationAtPreviousLevel !== undefined) {
      totalDuration += t.durationAtPreviousLevel
      durationCount += 1
    }
  }

  return {
    total: TRANSITIONS.length,
    crisisCount: getCrisisPeriods().length,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    byTransition,
  }
}
