import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CloudExecutionSlot {
  slotId: string
  tenantId: string
  executionId: string
  region: string
  priority: "low" | "normal" | "high" | "critical"
  allocatedAt: string
  expiresAt: string
  status: "active" | "released" | "expired"
}

const SLOTS: Map<string, CloudExecutionSlot> = new Map()
const SLOTS_CAP = 10000

const DEFAULT_TTL_MS = 5 * 60 * 1000

export function allocateSlot(
  tenantId: string,
  executionId: string,
  region: string,
  priority: CloudExecutionSlot["priority"],
  ttlMs = DEFAULT_TTL_MS,
): CloudExecutionSlot {
  if (isRuntimePaused()) {
    logger.warn("allocateSlot blocked: runtime is paused", "execution-cloud", { metadata: { tenantId, region } })
    throw new Error("Runtime is paused — slot allocation blocked")
  }
  if (SLOTS.size >= SLOTS_CAP) {
    const oldest = Array.from(SLOTS.keys())[0]
    if (oldest) SLOTS.delete(oldest)
  }
  const now = new Date()
  const slot: CloudExecutionSlot = {
    slotId: crypto.randomUUID(),
    tenantId,
    executionId,
    region,
    priority,
    allocatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    status: "active",
  }
  SLOTS.set(slot.slotId, slot)
  logger.info("Slot allocated", "execution-cloud", { metadata: { slotId: slot.slotId, region, priority } })
  return slot
}

export function releaseSlot(slotId: string): void {
  const slot = SLOTS.get(slotId)
  if (!slot) return
  slot.status = "released"
}

export function expireStaleSlots(): number {
  const now = new Date()
  let count = 0
  for (const slot of Array.from(SLOTS.values())) {
    if (slot.status === "active" && new Date(slot.expiresAt) < now) {
      slot.status = "expired"
      count++
    }
  }
  return count
}

export function getActiveSlots(tenantId?: string): CloudExecutionSlot[] {
  return Array.from(SLOTS.values()).filter(
    (s) => s.status === "active" && (tenantId === undefined || s.tenantId === tenantId),
  )
}

export function getSlotStats(): {
  total: number
  active: number
  released: number
  expired: number
  byRegion: Record<string, number>
  byPriority: Record<string, number>
} {
  const all = Array.from(SLOTS.values())
  const byRegion: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let active = 0, released = 0, expired = 0
  for (const s of all) {
    if (s.status === "active") active++
    else if (s.status === "released") released++
    else expired++
    byRegion[s.region] = (byRegion[s.region] ?? 0) + 1
    byPriority[s.priority] = (byPriority[s.priority] ?? 0) + 1
  }
  return { total: all.length, active, released, expired, byRegion, byPriority }
}
