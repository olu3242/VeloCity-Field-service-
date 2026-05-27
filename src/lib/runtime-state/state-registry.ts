/**
 * Runtime State Registry — tracks component health and heartbeats.
 * In-memory singleton with rolling cap of 500 entries.
 */

const REGISTRY_CAP = 500

export interface RuntimeStateEntry {
  id: string
  component: string
  tenantId?: string
  status: "healthy" | "degraded" | "critical" | "unknown"
  metadata: Record<string, unknown>
  version: string
  lastHeartbeatAt: string
  registeredAt: string
}

const REGISTRY: Map<string, RuntimeStateEntry> = new Map()

export function registerComponent(
  component: string,
  version: string,
  metadata?: Record<string, unknown>,
  tenantId?: string
): RuntimeStateEntry {
  if (REGISTRY.size >= REGISTRY_CAP) {
    const firstKey = Array.from(REGISTRY.keys())[0]
    if (firstKey !== undefined) REGISTRY.delete(firstKey)
  }
  const entry: RuntimeStateEntry = {
    id: crypto.randomUUID(),
    component,
    tenantId,
    status: "unknown",
    metadata: metadata ?? {},
    version,
    lastHeartbeatAt: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
  }
  REGISTRY.set(component, entry)
  return entry
}

export function updateHeartbeat(
  component: string,
  status: RuntimeStateEntry["status"],
  metadata?: Record<string, unknown>
): void {
  const entry = REGISTRY.get(component)
  if (!entry) return
  entry.status = status
  entry.lastHeartbeatAt = new Date().toISOString()
  if (metadata) entry.metadata = { ...entry.metadata, ...metadata }
}

export function getComponent(component: string): RuntimeStateEntry | undefined {
  return REGISTRY.get(component)
}

export function getHealthySystems(): RuntimeStateEntry[] {
  return Array.from(REGISTRY.values()).filter((e) => e.status === "healthy")
}

export function getDegradedSystems(): RuntimeStateEntry[] {
  return Array.from(REGISTRY.values()).filter(
    (e) => e.status === "degraded" || e.status === "critical"
  )
}

export function getAllRegistryEntries(): RuntimeStateEntry[] {
  return Array.from(REGISTRY.values())
}

export function getRegistrySnapshot(): {
  total: number
  healthy: number
  degraded: number
  critical: number
  unknown: number
} {
  const all = Array.from(REGISTRY.values())
  return {
    total: all.length,
    healthy: all.filter((e) => e.status === "healthy").length,
    degraded: all.filter((e) => e.status === "degraded").length,
    critical: all.filter((e) => e.status === "critical").length,
    unknown: all.filter((e) => e.status === "unknown").length,
  }
}
