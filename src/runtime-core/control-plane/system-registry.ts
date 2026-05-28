export type SubsystemCategory =
  | "governance"
  | "orchestration"
  | "ai-runtime"
  | "queue-fabric"
  | "telemetry"
  | "federation"
  | "financial"
  | "resilience"
  | "intelligence"

export interface SubsystemRegistration {
  subsystemId: string
  name: string
  version: string
  category: SubsystemCategory
  status: "active" | "degraded" | "offline" | "initializing"
  healthScore: number     // 0-100
  dependencies: string[]  // subsystemIds
  registeredAt: string
  lastHealthCheckAt: string
  metadata: Record<string, unknown>
}

const SUBSYSTEMS: Map<string, SubsystemRegistration> = new Map()

// Pre-register all known platform subsystems
const INITIAL_SUBSYSTEMS: Omit<SubsystemRegistration, "registeredAt" | "lastHealthCheckAt">[] = [
  { subsystemId: "governance", name: "Governance Layer", version: "1.0.0", category: "governance", status: "active", healthScore: 100, dependencies: [], metadata: {} },
  { subsystemId: "ai-dispatch", name: "AI Dispatch Engine", version: "1.0.0", category: "ai-runtime", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "automation-queue", name: "Automation Queue", version: "1.0.0", category: "queue-fabric", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "circuit-breakers", name: "Circuit Breaker Network", version: "1.0.0", category: "resilience", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "tenant-isolation", name: "Tenant Isolation", version: "1.0.0", category: "governance", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "sla-engine", name: "SLA Engine", version: "1.0.0", category: "orchestration", status: "active", healthScore: 100, dependencies: ["governance", "automation-queue"], metadata: {} },
  { subsystemId: "telemetry", name: "Telemetry Collector", version: "1.0.0", category: "telemetry", status: "active", healthScore: 100, dependencies: [], metadata: {} },
  { subsystemId: "certification", name: "Enterprise Certification", version: "1.0.0", category: "governance", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "federation", name: "Federation Hub", version: "1.0.0", category: "federation", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "treasury", name: "Treasury Layer", version: "1.0.0", category: "financial", status: "active", healthScore: 100, dependencies: ["governance"], metadata: {} },
  { subsystemId: "runtime-resilience", name: "Runtime Resilience", version: "1.0.0", category: "resilience", status: "active", healthScore: 100, dependencies: ["governance", "circuit-breakers"], metadata: {} },
  { subsystemId: "ops-telemetry", name: "Ops Telemetry", version: "1.0.0", category: "telemetry", status: "active", healthScore: 100, dependencies: [], metadata: {} },
]

const NOW = new Date().toISOString()
for (const s of INITIAL_SUBSYSTEMS) {
  SUBSYSTEMS.set(s.subsystemId, { ...s, registeredAt: NOW, lastHealthCheckAt: NOW })
}

export function registerSubsystem(reg: Omit<SubsystemRegistration, "registeredAt" | "lastHealthCheckAt">): SubsystemRegistration {
  const full: SubsystemRegistration = { ...reg, registeredAt: new Date().toISOString(), lastHealthCheckAt: new Date().toISOString() }
  SUBSYSTEMS.set(reg.subsystemId, full)
  return full
}

export function updateSubsystemHealth(subsystemId: string, status: SubsystemRegistration["status"], healthScore: number): void {
  const sub = SUBSYSTEMS.get(subsystemId)
  if (sub) {
    sub.status = status
    sub.healthScore = Math.max(0, Math.min(100, healthScore))
    sub.lastHealthCheckAt = new Date().toISOString()
  }
}

export function getSubsystem(subsystemId: string): SubsystemRegistration | undefined {
  return SUBSYSTEMS.get(subsystemId)
}

export function getSubsystemsByCategory(category: SubsystemCategory): SubsystemRegistration[] {
  return Array.from(SUBSYSTEMS.values()).filter((s) => s.category === category)
}

export function getActiveSubsystems(): SubsystemRegistration[] {
  return Array.from(SUBSYSTEMS.values()).filter((s) => s.status === "active")
}

export function getDegradedSubsystems(): SubsystemRegistration[] {
  return Array.from(SUBSYSTEMS.values()).filter((s) => s.status === "degraded" || s.status === "offline")
}

export function getSubsystemReport(): {
  total: number
  active: number
  degraded: number
  byCategory: Record<string, number>
  avgHealthScore: number
} {
  const all = Array.from(SUBSYSTEMS.values())
  const byCategory: Record<string, number> = {}
  let totalHealth = 0
  for (const s of all) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1
    totalHealth += s.healthScore
  }
  return {
    total: all.length,
    active: all.filter((s) => s.status === "active").length,
    degraded: all.filter((s) => s.status !== "active").length,
    byCategory,
    avgHealthScore: all.length > 0 ? Math.round(totalHealth / all.length) : 0,
  }
}
