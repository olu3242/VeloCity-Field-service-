import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ArchivalRecord {
  archivalId: string
  subsystem: string
  tenantId?: string
  eventsArchived: number
  archivalSizeKb: number
  archivalTier: "cold" | "deep"
  archivalLocation: string
  restorable: boolean
  archivedAt: string
  expiresAt?: string
}

const RECORDS: ArchivalRecord[] = []
const MAX_RECORDS = 500

function pruneRecords(): void {
  while (RECORDS.length >= MAX_RECORDS) {
    RECORDS.shift()
  }
}

export function archiveTelemetry(
  subsystem: string,
  eventCount: number,
  tier: ArchivalRecord["archivalTier"],
  tenantId?: string
): ArchivalRecord {
  if (isRuntimePaused()) {
    logger.warn("archiveTelemetry blocked: runtime paused", { subsystem })
    throw new Error("Runtime is paused")
  }

  pruneRecords()

  const now = new Date()
  const expiresAt =
    tier === "deep"
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : undefined

  const record: ArchivalRecord = {
    archivalId: crypto.randomUUID(),
    subsystem,
    tenantId,
    eventsArchived: eventCount,
    archivalSizeKb: eventCount * 0.1,
    archivalTier: tier,
    archivalLocation: `archive://${subsystem}/${tier}/${Date.now()}`,
    restorable: tier === "cold",
    archivedAt: now.toISOString(),
    expiresAt,
  }

  RECORDS.push(record)
  logger.info("Telemetry archived", { subsystem, tier, eventCount })
  return record
}

export function getArchivalHistory(subsystem: string): ArchivalRecord[] {
  return RECORDS.filter((r) => r.subsystem === subsystem)
}

export function getTotalArchivedKb(tenantId?: string): number {
  return RECORDS.filter((r) => tenantId === undefined || r.tenantId === tenantId).reduce(
    (s, r) => s + r.archivalSizeKb,
    0
  )
}

export function getArchivalSummary(): {
  total: number
  byTier: Record<string, number>
  totalSizeKb: number
  restorableCount: number
} {
  const byTier: Record<string, number> = {}
  for (const r of RECORDS) {
    byTier[r.archivalTier] = (byTier[r.archivalTier] ?? 0) + 1
  }
  return {
    total: RECORDS.length,
    byTier,
    totalSizeKb: RECORDS.reduce((s, r) => s + r.archivalSizeKb, 0),
    restorableCount: RECORDS.filter((r) => r.restorable).length,
  }
}
