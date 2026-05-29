import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type SchemaCategory =
  | "event"
  | "workflow"
  | "queue_item"
  | "trace"
  | "score"
  | "cognition"
  | "federation"

export interface SchemaSpec {
  schemaId: string
  name: string
  category: SchemaCategory
  version: string
  requiredFields: string[]
  optionalFields: string[]
  tenantAware: boolean
  correlationAware: boolean
  replaySafe: boolean
  registeredAt: string
}

const SCHEMAS: Map<string, SchemaSpec> = new Map()
const MAX_SCHEMAS = 500

export function registerSchema(
  name: string,
  category: SchemaCategory,
  version: string,
  required: string[],
  optional: string[],
  options?: { tenantAware?: boolean; correlationAware?: boolean; replaySafe?: boolean }
): SchemaSpec {
  if (isRuntimePaused()) {
    logger.warn("registerSchema blocked: runtime paused", "schema-registry")
    throw new Error("Runtime is paused")
  }
  if (SCHEMAS.size >= MAX_SCHEMAS) {
    const firstKey = SCHEMAS.keys().next().value as string
    SCHEMAS.delete(firstKey)
  }
  const schemaId = crypto.randomUUID()
  const spec: SchemaSpec = {
    schemaId,
    name,
    category,
    version,
    requiredFields: required,
    optionalFields: optional,
    tenantAware: options?.tenantAware ?? false,
    correlationAware: options?.correlationAware ?? false,
    replaySafe: options?.replaySafe ?? true,
    registeredAt: new Date().toISOString(),
  }
  SCHEMAS.set(schemaId, spec)
  logger.info(`Schema registered: ${name}`, "schema-registry")
  return spec
}

export function validateAgainstSchema(
  schemaId: string,
  record: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const spec = SCHEMAS.get(schemaId)
  if (!spec) return { valid: false, missingFields: ["schema_not_found"] }
  const missingFields = spec.requiredFields.filter((f) => !(f in record))
  return { valid: missingFields.length === 0, missingFields }
}

export function getSchema(schemaId: string): SchemaSpec | undefined {
  return SCHEMAS.get(schemaId)
}

export function getSchemasByCategory(category: SchemaCategory): SchemaSpec[] {
  return Array.from(SCHEMAS.values()).filter((s) => s.category === category)
}

export function getSchemaSummary(): {
  total: number
  byCategory: Record<string, number>
  tenantAware: number
} {
  const values = Array.from(SCHEMAS.values())
  const byCategory: Record<string, number> = {}
  for (const s of values) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1
  }
  return {
    total: values.length,
    byCategory,
    tenantAware: values.filter((s) => s.tenantAware).length,
  }
}

// Pre-register 5 core schemas
const CORE_SCHEMAS: [string, SchemaCategory, string[], string[]][] = [
  ["event-envelope", "event", ["eventId", "eventType", "emittedAt"], ["tenantId", "correlationId"]],
  ["queue-item", "queue_item", ["itemId", "payload", "priority"], ["tenantId", "correlationId"]],
  ["trace-context", "trace", ["traceId", "correlationId", "rootOperation"], ["tenantId", "causationId"]],
  ["normalized-score", "score", ["value", "dimension", "level"], ["tenantId", "entityId"]],
  ["execution-context", "workflow", ["executionId", "workflowType", "correlationId"], ["tenantId", "causationId"]],
]

for (const [name, category, required, optional] of CORE_SCHEMAS) {
  const schemaId = crypto.randomUUID()
  SCHEMAS.set(schemaId, {
    schemaId,
    name,
    category,
    version: "1.0",
    requiredFields: required,
    optionalFields: optional,
    tenantAware: optional.includes("tenantId"),
    correlationAware: required.includes("correlationId") || optional.includes("correlationId"),
    replaySafe: true,
    registeredAt: new Date().toISOString(),
  })
}
