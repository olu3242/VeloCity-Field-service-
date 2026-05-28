/**
 * Capability Registry — registry of runtime capabilities exposed by the kernel.
 * Pre-registers 8 core capabilities on module load.
 */

import { logger } from "@/runtime-core/observability"
import { setRegisteredCapabilities } from "./kernel"

export type CapabilityScope =
  | "execution"
  | "orchestration"
  | "telemetry"
  | "ai"
  | "federation"
  | "governance"

export interface RuntimeCapability {
  capabilityId: string
  name: string
  scope: CapabilityScope
  version: string
  tenantSafe: boolean
  replaySafe: boolean
  registeredAt: string
  metadata: Record<string, unknown>
}

const CAPABILITIES: Map<string, RuntimeCapability> = new Map()

interface RegisterOptions {
  tenantSafe?: boolean
  replaySafe?: boolean
  metadata?: Record<string, unknown>
}

export function registerCapability(
  name: string,
  scope: CapabilityScope,
  version: string,
  options?: RegisterOptions
): RuntimeCapability {
  const capability: RuntimeCapability = {
    capabilityId: crypto.randomUUID(),
    name,
    scope,
    version,
    tenantSafe: options?.tenantSafe ?? true,
    replaySafe: options?.replaySafe ?? false,
    registeredAt: new Date().toISOString(),
    metadata: options?.metadata ?? {},
  }
  CAPABILITIES.set(name, capability)
  setRegisteredCapabilities(CAPABILITIES.size)
  logger.info(`Capability registered: ${name}`, "capability-registry", {
    metadata: { scope, version },
  })
  return capability
}

export function getCapability(name: string): RuntimeCapability | undefined {
  return CAPABILITIES.get(name)
}

export function getCapabilitiesByScope(scope: CapabilityScope): RuntimeCapability[] {
  return Array.from(CAPABILITIES.values()).filter((c) => c.scope === scope)
}

export function getCapabilityReport(): {
  total: number
  byScope: Record<string, number>
  tenantSafeCount: number
} {
  const all = Array.from(CAPABILITIES.values())
  const byScope: Record<string, number> = {}
  for (const c of all) {
    byScope[c.scope] = (byScope[c.scope] ?? 0) + 1
  }
  return {
    total: all.length,
    byScope,
    tenantSafeCount: all.filter((c) => c.tenantSafe).length,
  }
}

// Pre-register 8 core capabilities
const CORE_CAPABILITIES: Array<[string, CapabilityScope, { replaySafe?: boolean }]> = [
  ["workflow-execution", "execution", { replaySafe: true }],
  ["ai-dispatch", "ai", {}],
  ["queue-fabric", "execution", {}],
  ["telemetry-emit", "telemetry", { replaySafe: true }],
  ["circuit-breaker", "governance", {}],
  ["distributed-trace", "telemetry", { replaySafe: true }],
  ["orchestration-state", "orchestration", { replaySafe: true }],
  ["federation-relay", "federation", {}],
]

for (const [name, scope, opts] of CORE_CAPABILITIES) {
  registerCapability(name, scope, "1.0.0", { tenantSafe: true, ...opts })
}
