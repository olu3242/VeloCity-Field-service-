export interface PlatformModule {
  moduleId: string
  name: string
  version: string
  category: "runtime" | "orchestration" | "intelligence" | "governance" | "financial" | "federation"
  status: "active" | "loading" | "failed" | "disabled"
  loadedAt: string
  dependencies: string[]
}

export const MODULES: Map<string, PlatformModule> = new Map()

const CORE_MODULES: Omit<PlatformModule, "loadedAt">[] = [
  { moduleId: "governance", name: "Governance Layer", version: "1.0.0", category: "governance", status: "active", dependencies: [] },
  { moduleId: "orchestration", name: "Orchestration Engine", version: "1.0.0", category: "orchestration", status: "active", dependencies: ["governance"] },
  { moduleId: "ai-dispatch", name: "AI Dispatch", version: "1.0.0", category: "runtime", status: "active", dependencies: ["governance", "orchestration"] },
  { moduleId: "queue-fabric", name: "Queue Fabric", version: "1.0.0", category: "runtime", status: "active", dependencies: ["governance"] },
  { moduleId: "telemetry", name: "Telemetry Layer", version: "1.0.0", category: "intelligence", status: "active", dependencies: [] },
  { moduleId: "federation", name: "Federation Hub", version: "1.0.0", category: "federation", status: "active", dependencies: ["governance"] },
  { moduleId: "treasury", name: "Treasury Layer", version: "1.0.0", category: "financial", status: "active", dependencies: ["governance"] },
  { moduleId: "resilience", name: "Resilience Engine", version: "1.0.0", category: "runtime", status: "active", dependencies: ["governance", "orchestration"] },
]

for (const m of CORE_MODULES) {
  MODULES.set(m.moduleId, { ...m, loadedAt: new Date().toISOString() })
}

export function getModule(moduleId: string): PlatformModule | undefined {
  return MODULES.get(moduleId)
}

export function registerModule(module: Omit<PlatformModule, "loadedAt">): PlatformModule {
  const full: PlatformModule = { ...module, loadedAt: new Date().toISOString() }
  MODULES.set(module.moduleId, full)
  return full
}

export function getModulesByCategory(category: PlatformModule["category"]): PlatformModule[] {
  return Array.from(MODULES.values()).filter((m) => m.category === category)
}

export function getActiveModules(): PlatformModule[] {
  return Array.from(MODULES.values()).filter((m) => m.status === "active")
}

export function getPlatformModuleReport(): {
  total: number
  byCategory: Record<string, number>
  byStatus: Record<string, number>
} {
  const byCategory: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const m of Array.from(MODULES.values())) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
  }
  return { total: MODULES.size, byCategory, byStatus }
}
