import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type ProtocolDomain =
  | "orchestration"
  | "queue"
  | "federation"
  | "cognition"
  | "tracing"
  | "events"
  | "execution"

export interface ProtocolSpec {
  protocolId: string
  name: string
  domain: ProtocolDomain
  currentVersion: string
  supportedVersions: string[]
  deprecated: string[]
  stable: boolean
  replaySafe: boolean
  federationSafe: boolean
  registeredAt: string
}

const REGISTRY: Map<string, ProtocolSpec> = new Map()

export function registerProtocol(
  name: string,
  domain: ProtocolDomain,
  currentVersion: string,
  options?: { stable?: boolean; replaySafe?: boolean; federationSafe?: boolean }
): ProtocolSpec {
  if (isRuntimePaused()) {
    logger.warn("registerProtocol blocked: runtime paused", "protocol-registry")
    throw new Error("Runtime is paused")
  }
  const protocolId = crypto.randomUUID()
  const spec: ProtocolSpec = {
    protocolId,
    name,
    domain,
    currentVersion,
    supportedVersions: [currentVersion],
    deprecated: [],
    stable: options?.stable ?? true,
    replaySafe: options?.replaySafe ?? true,
    federationSafe: options?.federationSafe ?? true,
    registeredAt: new Date().toISOString(),
  }
  REGISTRY.set(protocolId, spec)
  logger.info(`Protocol registered: ${name}`, "protocol-registry")
  return spec
}

export function deprecateVersion(protocolId: string, version: string): void {
  const spec = REGISTRY.get(protocolId)
  if (!spec) return
  if (!spec.deprecated.includes(version)) spec.deprecated.push(version)
}

export function isVersionSupported(protocolId: string, version: string): boolean {
  const spec = REGISTRY.get(protocolId)
  if (!spec) return false
  return spec.supportedVersions.includes(version) && !spec.deprecated.includes(version)
}

export function getProtocol(protocolId: string): ProtocolSpec | undefined {
  return REGISTRY.get(protocolId)
}

export function getProtocolsByDomain(domain: ProtocolDomain): ProtocolSpec[] {
  return Array.from(REGISTRY.values()).filter((p) => p.domain === domain)
}

export function getRegistrySummary(): {
  total: number
  stable: number
  replaySafe: number
  byDomain: Record<string, number>
} {
  const values = Array.from(REGISTRY.values())
  const byDomain: Record<string, number> = {}
  for (const p of values) {
    byDomain[p.domain] = (byDomain[p.domain] ?? 0) + 1
  }
  return {
    total: values.length,
    stable: values.filter((p) => p.stable).length,
    replaySafe: values.filter((p) => p.replaySafe).length,
    byDomain,
  }
}

// Pre-register 7 core protocols
const CORE_PROTOCOLS: [string, ProtocolDomain][] = [
  ["workflow-execution", "orchestration"],
  ["queue-contract", "queue"],
  ["federation-packet", "federation"],
  ["cognition-trace", "cognition"],
  ["distributed-trace", "tracing"],
  ["canonical-events", "events"],
  ["execution-context", "execution"],
]

for (const [name, domain] of CORE_PROTOCOLS) {
  const spec: ProtocolSpec = {
    protocolId: crypto.randomUUID(),
    name,
    domain,
    currentVersion: "1.0",
    supportedVersions: ["1.0"],
    deprecated: [],
    stable: true,
    replaySafe: true,
    federationSafe: true,
    registeredAt: new Date().toISOString(),
  }
  REGISTRY.set(spec.protocolId, spec)
}
