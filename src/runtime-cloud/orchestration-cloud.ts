import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CloudOrchestrationRecord {
  orchestrationId: string
  workflowType: string
  tenantId?: string
  region: string
  federationId?: string
  status: "routing" | "executing" | "completing" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  hops: string[]
  priority: "low" | "normal" | "high" | "critical"
}

const ORCHESTRATIONS: Map<string, CloudOrchestrationRecord> = new Map()
const ORCHESTRATIONS_CAP = 5000

function pruneOrchestrations(): void {
  if (ORCHESTRATIONS.size >= ORCHESTRATIONS_CAP) {
    const oldest = Array.from(ORCHESTRATIONS.keys())[0]
    if (oldest) ORCHESTRATIONS.delete(oldest)
  }
}

export function startCloudOrchestration(
  workflowType: string,
  region: string,
  priority: CloudOrchestrationRecord["priority"],
  tenantId?: string,
  federationId?: string,
): CloudOrchestrationRecord {
  if (isRuntimePaused()) {
    logger.warn("startCloudOrchestration blocked: runtime is paused", "orchestration-cloud", {
      metadata: { workflowType, region },
    })
    throw new Error("Runtime is paused — orchestration blocked")
  }
  pruneOrchestrations()
  const record: CloudOrchestrationRecord = {
    orchestrationId: crypto.randomUUID(),
    workflowType,
    tenantId,
    region,
    federationId,
    status: "routing",
    startedAt: new Date().toISOString(),
    hops: [region],
    priority,
  }
  ORCHESTRATIONS.set(record.orchestrationId, record)
  logger.info("Cloud orchestration started", "orchestration-cloud", {
    metadata: { orchestrationId: record.orchestrationId, workflowType, region },
  })
  return record
}

export function recordHop(orchestrationId: string, region: string): void {
  const record = ORCHESTRATIONS.get(orchestrationId)
  if (!record) return
  record.hops.push(region)
  record.status = "executing"
}

export function completeCloudOrchestration(orchestrationId: string): void {
  const record = ORCHESTRATIONS.get(orchestrationId)
  if (!record) return
  record.status = "completed"
  record.completedAt = new Date().toISOString()
}

export function failCloudOrchestration(orchestrationId: string): void {
  const record = ORCHESTRATIONS.get(orchestrationId)
  if (!record) return
  record.status = "failed"
  record.completedAt = new Date().toISOString()
}

export function getActiveOrchestrations(region?: string): CloudOrchestrationRecord[] {
  const active: CloudOrchestrationRecord["status"][] = ["routing", "executing", "completing"]
  return Array.from(ORCHESTRATIONS.values()).filter(
    (r) => active.includes(r.status) && (region === undefined || r.region === region),
  )
}

export function getOrchestrationSummary(): {
  total: number
  active: number
  completed: number
  failed: number
  multiRegion: number
} {
  const all = Array.from(ORCHESTRATIONS.values())
  const activeStatuses: CloudOrchestrationRecord["status"][] = ["routing", "executing", "completing"]
  const active = all.filter((r) => activeStatuses.includes(r.status)).length
  const completed = all.filter((r) => r.status === "completed").length
  const failed = all.filter((r) => r.status === "failed").length
  const multiRegion = all.filter((r) => r.hops.length > 1).length
  return { total: all.length, active, completed, failed, multiRegion }
}
