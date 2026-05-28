/**
 * Execution Supervisor — detects stalls and enforces deadlines for running executions.
 */

import { logger } from "@/runtime-core/observability"

export interface SupervisionRecord {
  executionId: string
  tenantId?: string
  startedAt: string
  deadline?: string
  lastHeartbeatAt: string
  heartbeatCount: number
  status: "healthy" | "stalled" | "expired" | "terminated"
  workflowType: string
}

const SUPERVISED: Map<string, SupervisionRecord> = new Map()
const SUPERVISED_CAP = 2000
const STALL_THRESHOLD_MS = 30_000

export function register(
  executionId: string,
  workflowType: string,
  deadline?: string,
  tenantId?: string
): SupervisionRecord {
  if (SUPERVISED.size >= SUPERVISED_CAP) {
    const firstKey = Array.from(SUPERVISED.keys())[0]
    if (firstKey !== undefined) SUPERVISED.delete(firstKey)
  }
  const record: SupervisionRecord = {
    executionId,
    tenantId,
    startedAt: new Date().toISOString(),
    deadline,
    lastHeartbeatAt: new Date().toISOString(),
    heartbeatCount: 0,
    status: "healthy",
    workflowType,
  }
  SUPERVISED.set(executionId, record)
  return record
}

export function heartbeat(executionId: string): void {
  const record = SUPERVISED.get(executionId)
  if (record) {
    record.lastHeartbeatAt = new Date().toISOString()
    record.heartbeatCount++
    if (record.status === "stalled") record.status = "healthy"
  }
}

export function checkExpiry(): SupervisionRecord[] {
  const now = new Date()
  const expired: SupervisionRecord[] = []

  for (const record of Array.from(SUPERVISED.values())) {
    if (record.status === "terminated") continue

    // Check deadline expiry
    if (record.deadline && new Date(record.deadline) < now) {
      if (record.status !== "expired") {
        record.status = "expired"
        expired.push(record)
        logger.warn(`Execution expired: ${record.executionId}`, "execution-supervisor", {
          metadata: { workflowType: record.workflowType, deadline: record.deadline },
        })
      }
      continue
    }

    // Check stall (no heartbeat within threshold)
    const msSinceHeartbeat = now.getTime() - new Date(record.lastHeartbeatAt).getTime()
    if (msSinceHeartbeat > STALL_THRESHOLD_MS && record.status === "healthy") {
      record.status = "stalled"
      expired.push(record)
      logger.warn(`Execution stalled: ${record.executionId}`, "execution-supervisor", {
        metadata: { msSinceHeartbeat },
      })
    }
  }

  return expired
}

export function terminate(executionId: string): void {
  const record = SUPERVISED.get(executionId)
  if (record) record.status = "terminated"
}

export function getSupervisorReport(): {
  total: number
  healthy: number
  stalled: number
  expired: number
  terminated: number
} {
  const all = Array.from(SUPERVISED.values())
  return {
    total: all.length,
    healthy: all.filter((r) => r.status === "healthy").length,
    stalled: all.filter((r) => r.status === "stalled").length,
    expired: all.filter((r) => r.status === "expired").length,
    terminated: all.filter((r) => r.status === "terminated").length,
  }
}
