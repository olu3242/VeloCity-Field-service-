import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface EventStandard {
  standardId: string
  eventType: string
  category: "operational" | "lifecycle" | "governance" | "federation" | "cognition" | "performance"
  requiredMetadata: string[]
  correlationRequired: boolean
  tenantRequired: boolean
  replaySafe: boolean
  idempotent: boolean
  registeredAt: string
}

const STANDARDS: Map<string, EventStandard> = new Map()
const MAX_STANDARDS = 500

export function registerEventStandard(
  eventType: string,
  category: EventStandard["category"],
  required: string[],
  options?: {
    correlationRequired?: boolean
    tenantRequired?: boolean
    replaySafe?: boolean
    idempotent?: boolean
  }
): EventStandard {
  if (isRuntimePaused()) {
    logger.warn("registerEventStandard blocked: runtime paused", "event-standards")
    throw new Error("Runtime is paused")
  }
  if (STANDARDS.size >= MAX_STANDARDS) {
    const firstKey = STANDARDS.keys().next().value as string
    STANDARDS.delete(firstKey)
  }
  const standard: EventStandard = {
    standardId: crypto.randomUUID(),
    eventType,
    category,
    requiredMetadata: required,
    correlationRequired: options?.correlationRequired ?? true,
    tenantRequired: options?.tenantRequired ?? false,
    replaySafe: options?.replaySafe ?? true,
    idempotent: options?.idempotent ?? true,
    registeredAt: new Date().toISOString(),
  }
  STANDARDS.set(eventType, standard)
  logger.info(`Event standard registered: ${eventType}`, "event-standards")
  return standard
}

export function validateEvent(
  eventType: string,
  metadata: Record<string, unknown>
): { valid: boolean; violations: string[] } {
  const standard = STANDARDS.get(eventType)
  if (!standard) return { valid: false, violations: ["event_type_not_registered"] }
  const violations: string[] = []
  for (const field of standard.requiredMetadata) {
    if (!(field in metadata)) violations.push(`missing required field: ${field}`)
  }
  if (standard.correlationRequired && !("correlationId" in metadata)) {
    violations.push("correlationId required but missing")
  }
  return { valid: violations.length === 0, violations }
}

export function getStandard(eventType: string): EventStandard | undefined {
  return STANDARDS.get(eventType)
}

export function getStandardsByCategory(category: EventStandard["category"]): EventStandard[] {
  return Array.from(STANDARDS.values()).filter((s) => s.category === category)
}

export function getStandardsSummary(): {
  total: number
  byCategory: Record<string, number>
  replaySafe: number
} {
  const values = Array.from(STANDARDS.values())
  const byCategory: Record<string, number> = {}
  for (const s of values) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1
  }
  return {
    total: values.length,
    byCategory,
    replaySafe: values.filter((s) => s.replaySafe).length,
  }
}

// Pre-register 6 core event standards
type CoreEntry = [string, EventStandard["category"], string[]]
const CORE_STANDARDS: CoreEntry[] = [
  ["workflow_started", "lifecycle", ["workflowType", "executionId"]],
  ["workflow_completed", "lifecycle", ["workflowType", "executionId", "durationMs"]],
  ["workflow_failed", "lifecycle", ["workflowType", "executionId", "error"]],
  ["governance_violation", "governance", ["violationType", "entityId", "severity"]],
  ["federation_relay", "federation", ["sourceFederationId", "targetFederationId", "payloadType"]],
  ["cognition_decision", "cognition", ["domain", "confidence", "decision"]],
]

for (const [eventType, category, required] of CORE_STANDARDS) {
  STANDARDS.set(eventType, {
    standardId: crypto.randomUUID(),
    eventType,
    category,
    requiredMetadata: required,
    correlationRequired: true,
    tenantRequired: false,
    replaySafe: true,
    idempotent: true,
    registeredAt: new Date().toISOString(),
  })
}
