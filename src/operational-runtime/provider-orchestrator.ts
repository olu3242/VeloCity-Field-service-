import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type ProviderOrchestrationPhase =
  | "lead_capture" | "verification" | "activation" | "active" | "quality_review" | "suspended"

export interface ProviderOrchestrationRecord {
  recordId: string
  providerId: string
  tenantId?: string
  phase: ProviderOrchestrationPhase
  previousPhase?: ProviderOrchestrationPhase
  activationScore: number
  qualityScore: number
  churnRisk: number
  eventsEmitted: string[]
  lastTransitionAt: string
  createdAt: string
}

const RECORDS: Map<string, ProviderOrchestrationRecord> = new Map()
const RECORDS_CAP = 10000

export function orchestrateProvider(
  providerId: string,
  phase: ProviderOrchestrationPhase,
  scores: { activation: number; quality: number; churnRisk: number },
  tenantId?: string,
): ProviderOrchestrationRecord {
  if (isRuntimePaused()) {
    logger.warn("orchestrateProvider blocked: runtime paused", "provider-orchestrator", { metadata: { providerId } })
    throw new Error("Runtime is paused")
  }
  const existing = RECORDS.get(providerId)
  const now = new Date().toISOString()
  const eventsEmitted = existing ? [...existing.eventsEmitted, `provider_${phase}`] : [`provider_${phase}`]
  if (!existing && RECORDS.size >= RECORDS_CAP) {
    const firstKey = Array.from(RECORDS.keys())[0]
    if (firstKey !== undefined) RECORDS.delete(firstKey)
  }
  const record: ProviderOrchestrationRecord = {
    recordId: existing?.recordId ?? crypto.randomUUID(),
    providerId,
    tenantId,
    phase,
    previousPhase: existing?.phase,
    activationScore: clampScore(scores.activation),
    qualityScore: clampScore(scores.quality),
    churnRisk: clampScore(scores.churnRisk),
    eventsEmitted,
    lastTransitionAt: now,
    createdAt: existing?.createdAt ?? now,
  }
  RECORDS.set(providerId, record)
  return record
}

export function transitionPhase(providerId: string, newPhase: ProviderOrchestrationPhase): void {
  if (isRuntimePaused()) {
    logger.warn("transitionPhase blocked: runtime paused", "provider-orchestrator", { metadata: { providerId } })
    return
  }
  const record = RECORDS.get(providerId)
  if (!record) return
  RECORDS.set(providerId, {
    ...record,
    previousPhase: record.phase,
    phase: newPhase,
    eventsEmitted: [...record.eventsEmitted, `provider_${newPhase}`],
    lastTransitionAt: new Date().toISOString(),
  })
}

export function getProvider(providerId: string): ProviderOrchestrationRecord | undefined {
  return RECORDS.get(providerId)
}

export function getProvidersByPhase(phase: ProviderOrchestrationPhase): ProviderOrchestrationRecord[] {
  return Array.from(RECORDS.values()).filter((r) => r.phase === phase)
}

export function getOrchestrationSummary(): {
  total: number
  byPhase: Record<string, number>
  avgActivationScore: number
  avgChurnRisk: number
} {
  const all = Array.from(RECORDS.values())
  const byPhase: Record<string, number> = {}
  let totalActivation = 0
  let totalChurn = 0
  for (const r of all) {
    byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1
    totalActivation += r.activationScore
    totalChurn += r.churnRisk
  }
  const count = all.length || 1
  return { total: all.length, byPhase, avgActivationScore: totalActivation / count, avgChurnRisk: totalChurn / count }
}
