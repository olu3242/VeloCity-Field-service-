import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface RuntimeSpecification {
  specId: string
  name: string
  value: unknown
  description: string
  category: "limits" | "timeouts" | "retries" | "capacity" | "protocol" | "federation"
  mutable: boolean
  lastUpdatedAt: string
}

const SPECIFICATIONS: Map<string, RuntimeSpecification> = new Map()
const MAX_SPECS = 200

export function registerSpec(
  name: string,
  value: unknown,
  description: string,
  category: RuntimeSpecification["category"],
  mutable = false
): RuntimeSpecification {
  if (isRuntimePaused()) {
    logger.warn("registerSpec blocked: runtime paused", "runtime-specifications")
    throw new Error("Runtime is paused")
  }
  if (SPECIFICATIONS.size >= MAX_SPECS) {
    const oldest = Array.from(SPECIFICATIONS.keys())[0]
    if (oldest !== undefined) SPECIFICATIONS.delete(oldest)
  }
  const spec: RuntimeSpecification = {
    specId: crypto.randomUUID(),
    name,
    value,
    description,
    category,
    mutable,
    lastUpdatedAt: new Date().toISOString(),
  }
  SPECIFICATIONS.set(name, spec)
  logger.info(`Spec registered: ${name}`, "runtime-specifications")
  return spec
}

export function updateSpec(name: string, value: unknown): void {
  if (isRuntimePaused()) {
    logger.warn("updateSpec blocked: runtime paused", "runtime-specifications")
    throw new Error("Runtime is paused")
  }
  const spec = SPECIFICATIONS.get(name)
  if (!spec || !spec.mutable) return
  spec.value = value
  spec.lastUpdatedAt = new Date().toISOString()
  logger.info(`Spec updated: ${name}`, "runtime-specifications")
}

export function getSpec(name: string): RuntimeSpecification | undefined {
  return SPECIFICATIONS.get(name)
}

export function getSpecsByCategory(
  category: RuntimeSpecification["category"]
): RuntimeSpecification[] {
  return Array.from(SPECIFICATIONS.values()).filter((s) => s.category === category)
}

export function getSpecsSummary(): {
  total: number
  mutable: number
  byCategory: Record<string, number>
} {
  const values = Array.from(SPECIFICATIONS.values())
  const byCategory: Record<string, number> = {}
  for (const s of values) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1
  }
  return {
    total: values.length,
    mutable: values.filter((s) => s.mutable).length,
    byCategory,
  }
}

// Pre-register 8 core specs (all mutable: false)
const CORE_SPECS: [string, unknown, string, RuntimeSpecification["category"]][] = [
  ["max_execution_concurrency", 1000, "Maximum concurrent executions", "capacity"],
  ["default_timeout_ms", 30000, "Default execution timeout in milliseconds", "timeouts"],
  ["max_retry_attempts", 5, "Maximum retry attempts per execution", "retries"],
  ["max_queue_depth", 50000, "Maximum queue depth", "limits"],
  ["protocol_version", "1.0.0", "Current protocol version", "protocol"],
  ["max_federation_peers", 100, "Maximum federation peer connections", "federation"],
  ["cognition_confidence_threshold", 0.65, "Minimum confidence threshold for cognition", "limits"],
  ["max_workflow_steps", 100, "Maximum steps per workflow", "limits"],
]

for (const [name, value, description, category] of CORE_SPECS) {
  const spec: RuntimeSpecification = {
    specId: crypto.randomUUID(),
    name,
    value,
    description,
    category,
    mutable: false,
    lastUpdatedAt: new Date().toISOString(),
  }
  SPECIFICATIONS.set(name, spec)
}
