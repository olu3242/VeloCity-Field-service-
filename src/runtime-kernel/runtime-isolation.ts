/**
 * Tenant and execution isolation layer — quotas, concurrency limits, isolation levels.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface IsolationScope {
  scopeId: string
  tenantId: string
  maxConcurrentExecutions: number
  currentExecutions: number
  quotaExecutionsPerMinute: number
  executionsThisMinute: number
  quotaWindowStart: string
  isolationLevel: "standard" | "strict" | "federated"
  createdAt: string
}

const SCOPES: Map<string, IsolationScope> = new Map()
const SCOPES_CAP = 1000

interface ScopeOptions {
  maxConcurrentExecutions?: number
  quotaExecutionsPerMinute?: number
  isolationLevel?: IsolationScope["isolationLevel"]
}

export function getOrCreateScope(tenantId: string, options?: ScopeOptions): IsolationScope {
  const existing = SCOPES.get(tenantId)
  if (existing) return existing

  if (SCOPES.size >= SCOPES_CAP) {
    const firstKey = Array.from(SCOPES.keys())[0]
    if (firstKey !== undefined) SCOPES.delete(firstKey)
  }

  const scope: IsolationScope = {
    scopeId: crypto.randomUUID(),
    tenantId,
    maxConcurrentExecutions: options?.maxConcurrentExecutions ?? 50,
    currentExecutions: 0,
    quotaExecutionsPerMinute: options?.quotaExecutionsPerMinute ?? 200,
    executionsThisMinute: 0,
    quotaWindowStart: new Date().toISOString(),
    isolationLevel: options?.isolationLevel ?? "standard",
    createdAt: new Date().toISOString(),
  }
  SCOPES.set(tenantId, scope)
  return scope
}

export function acquireSlot(tenantId: string): boolean {
  if (isRuntimePaused()) {
    logger.warn("acquireSlot blocked — runtime paused", "runtime-isolation", { metadata: { tenantId } })
    return false
  }

  const scope = getOrCreateScope(tenantId)
  const now = new Date()
  const windowStart = new Date(scope.quotaWindowStart)
  const windowElapsedMs = now.getTime() - windowStart.getTime()

  // Reset quota window if > 60 seconds
  if (windowElapsedMs >= 60_000) {
    scope.executionsThisMinute = 0
    scope.quotaWindowStart = now.toISOString()
  }

  if (scope.currentExecutions >= scope.maxConcurrentExecutions) {
    logger.warn("Concurrency limit reached", "runtime-isolation", {
      metadata: { tenantId, currentExecutions: scope.currentExecutions },
    })
    return false
  }

  if (scope.executionsThisMinute >= scope.quotaExecutionsPerMinute) {
    logger.warn("Quota limit reached", "runtime-isolation", {
      metadata: { tenantId, executionsThisMinute: scope.executionsThisMinute },
    })
    return false
  }

  scope.currentExecutions++
  scope.executionsThisMinute++
  return true
}

export function releaseSlot(tenantId: string): void {
  const scope = SCOPES.get(tenantId)
  if (scope && scope.currentExecutions > 0) scope.currentExecutions--
}

export function resetQuotaWindow(tenantId: string): void {
  const scope = SCOPES.get(tenantId)
  if (scope) {
    scope.executionsThisMinute = 0
    scope.quotaWindowStart = new Date().toISOString()
  }
}

export function getIsolationReport(): {
  totalTenants: number
  totalActiveExecutions: number
  quarantinedTenants: string[]
} {
  const all = Array.from(SCOPES.values())
  const totalActiveExecutions = all.reduce((sum, s) => sum + s.currentExecutions, 0)
  const quarantinedTenants = all
    .filter((s) => s.currentExecutions >= s.maxConcurrentExecutions)
    .map((s) => s.tenantId)
  return { totalTenants: all.length, totalActiveExecutions, quarantinedTenants }
}
