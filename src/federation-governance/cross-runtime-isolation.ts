import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface IsolationBoundary {
  boundaryId: string
  sourceRuntime: string
  targetRuntime: string
  tenantId?: string
  isolationLevel: "strict" | "relaxed" | "trusted_peer"
  allowedFlows: string[]
  blockedFlows: string[]
  enforcedAt: string
  lastValidatedAt: string
}

const BOUNDARIES = new Map<string, IsolationBoundary>()
const MAX_BOUNDARIES = 200

export function defineIsolationBoundary(
  sourceRuntime: string,
  targetRuntime: string,
  level: IsolationBoundary["isolationLevel"],
  allowedFlows: string[],
  tenantId?: string
): IsolationBoundary {
  if (isRuntimePaused()) {
    logger.warn("defineIsolationBoundary blocked: runtime paused", { sourceRuntime, targetRuntime })
    throw new Error("Runtime is paused")
  }

  const key = `${sourceRuntime}:${targetRuntime}`

  if (BOUNDARIES.size >= MAX_BOUNDARIES && !BOUNDARIES.has(key)) {
    const oldest = Array.from(BOUNDARIES.keys())[0]
    BOUNDARIES.delete(oldest)
  }

  const now = new Date().toISOString()
  const boundary: IsolationBoundary = {
    boundaryId: crypto.randomUUID(),
    sourceRuntime,
    targetRuntime,
    tenantId,
    isolationLevel: level,
    allowedFlows,
    blockedFlows: [],
    enforcedAt: now,
    lastValidatedAt: now,
  }

  BOUNDARIES.set(key, boundary)
  logger.info("Isolation boundary defined", { key, level })
  return boundary
}

export function blockFlow(sourceRuntime: string, targetRuntime: string, flow: string): void {
  const key = `${sourceRuntime}:${targetRuntime}`
  const b = BOUNDARIES.get(key)
  if (!b) return
  if (!b.blockedFlows.includes(flow)) {
    b.blockedFlows.push(flow)
  }
}

export function isFlowAllowed(sourceRuntime: string, targetRuntime: string, flow: string): boolean {
  const key = `${sourceRuntime}:${targetRuntime}`
  const b = BOUNDARIES.get(key)
  if (!b) return false
  if (b.blockedFlows.includes(flow)) return false
  if (b.allowedFlows.includes(flow)) return true
  return b.isolationLevel !== "strict"
}

export function getIsolationSummary(): {
  total: number
  strict: number
  relaxed: number
  trusted: number
  totalBlockedFlows: number
} {
  const all = Array.from(BOUNDARIES.values())
  return {
    total: all.length,
    strict: all.filter((b) => b.isolationLevel === "strict").length,
    relaxed: all.filter((b) => b.isolationLevel === "relaxed").length,
    trusted: all.filter((b) => b.isolationLevel === "trusted_peer").length,
    totalBlockedFlows: all.reduce((s, b) => s + b.blockedFlows.length, 0),
  }
}
