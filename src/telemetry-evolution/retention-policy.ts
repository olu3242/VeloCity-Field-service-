import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type RetentionTier = "hot" | "warm" | "cold" | "archived"

export interface RetentionPolicy {
  policyId: string
  subsystem: string
  tenantId?: string
  hotRetentionMinutes: number
  warmRetentionHours: number
  coldRetentionDays: number
  archivalEnabled: boolean
  currentTier: RetentionTier
  lastTieredAt: string
}

const POLICIES = new Map<string, RetentionPolicy>()
const MAX_POLICIES = 200

export function registerPolicy(
  subsystem: string,
  hotMinutes: number,
  warmHours: number,
  coldDays: number,
  archivalEnabled = false,
  tenantId?: string
): RetentionPolicy {
  if (isRuntimePaused()) {
    logger.warn("registerPolicy blocked: runtime paused", { subsystem })
    throw new Error("Runtime is paused")
  }

  if (POLICIES.size >= MAX_POLICIES && !POLICIES.has(subsystem)) {
    const oldest = Array.from(POLICIES.keys())[0]
    POLICIES.delete(oldest)
  }

  const policy: RetentionPolicy = {
    policyId: crypto.randomUUID(),
    subsystem,
    tenantId,
    hotRetentionMinutes: hotMinutes,
    warmRetentionHours: warmHours,
    coldRetentionDays: coldDays,
    archivalEnabled,
    currentTier: "hot",
    lastTieredAt: new Date().toISOString(),
  }

  POLICIES.set(subsystem, policy)
  logger.info("Retention policy registered", { subsystem })
  return policy
}

export function evaluateTier(subsystem: string, ageMinutes: number): RetentionTier {
  const policy = POLICIES.get(subsystem)
  if (!policy) return "archived"

  if (ageMinutes <= policy.hotRetentionMinutes) return "hot"
  if (ageMinutes <= policy.warmRetentionHours * 60) return "warm"
  if (ageMinutes <= policy.coldRetentionDays * 1440) return "cold"
  return "archived"
}

export function applyTiering(subsystem: string, ageMinutes: number): void {
  const policy = POLICIES.get(subsystem)
  if (!policy) return
  policy.currentTier = evaluateTier(subsystem, ageMinutes)
  policy.lastTieredAt = new Date().toISOString()
}

export function getPoliciesByTier(tier: RetentionTier): RetentionPolicy[] {
  return Array.from(POLICIES.values()).filter((p) => p.currentTier === tier)
}

export function getRetentionSummary(): {
  total: number
  byTier: Record<string, number>
  archivalEnabled: number
} {
  const all = Array.from(POLICIES.values())
  const byTier: Record<string, number> = {}
  for (const p of all) {
    byTier[p.currentTier] = (byTier[p.currentTier] ?? 0) + 1
  }
  return {
    total: all.length,
    byTier,
    archivalEnabled: all.filter((p) => p.archivalEnabled).length,
  }
}
