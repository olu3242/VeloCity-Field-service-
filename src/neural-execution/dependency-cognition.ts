import { logger } from "@/runtime-core/observability"

export interface DependencyCognitionRecord {
  recordId: string
  dependencyName: string
  dependencyType: "subsystem" | "queue" | "external" | "agent" | "database"
  tenantId?: string
  healthScore: number
  failureMemory: number
  recoveryPatterns: string[]
  lastEvaluatedAt: string
  criticalForWorkflows: string[]
}

const COGNITION: Map<string, DependencyCognitionRecord> = new Map()
const COGNITION_CAP = 500

export function evaluateDependency(
  name: string,
  type: DependencyCognitionRecord["dependencyType"],
  healthScore: number,
  criticalWorkflows: string[] = [],
  tenantId?: string,
): DependencyCognitionRecord {
  if (COGNITION.size >= COGNITION_CAP && !COGNITION.has(name)) {
    const firstKey = Array.from(COGNITION.keys())[0]
    COGNITION.delete(firstKey)
  }
  const existing = COGNITION.get(name)
  if (existing) {
    existing.healthScore = Math.max(0, Math.min(100, healthScore))
    existing.criticalForWorkflows = criticalWorkflows
    existing.lastEvaluatedAt = new Date().toISOString()
    return existing
  }
  const record: DependencyCognitionRecord = {
    recordId: crypto.randomUUID(),
    dependencyName: name,
    dependencyType: type,
    tenantId,
    healthScore: Math.max(0, Math.min(100, healthScore)),
    failureMemory: 0,
    recoveryPatterns: [],
    lastEvaluatedAt: new Date().toISOString(),
    criticalForWorkflows: criticalWorkflows,
  }
  COGNITION.set(name, record)
  logger.info(`Dependency evaluated: ${name}`, "dependency-cognition", { metadata: { type, healthScore } })
  return record
}

export function recordFailure(dependencyName: string): void {
  const rec = COGNITION.get(dependencyName)
  if (!rec) return
  rec.failureMemory = Math.min(1, rec.failureMemory + 0.1)
}

export function recordRecovery(dependencyName: string, pattern: string): void {
  const rec = COGNITION.get(dependencyName)
  if (!rec) return
  if (!rec.recoveryPatterns.includes(pattern)) rec.recoveryPatterns.push(pattern)
  rec.failureMemory = Math.max(0, rec.failureMemory - 0.05)
}

export function getCriticalDependencies(): DependencyCognitionRecord[] {
  return Array.from(COGNITION.values()).filter(r => r.criticalForWorkflows.length > 0 && r.healthScore < 70)
}

export function getDependencySummary(): { total: number; critical: number; avgHealth: number; highRisk: string[] } {
  const values = Array.from(COGNITION.values())
  const avgHealth = values.length > 0 ? values.reduce((s, r) => s + r.healthScore, 0) / values.length : 0
  const highRisk = values.filter(r => r.failureMemory > 0.5).map(r => r.dependencyName)
  return { total: COGNITION.size, critical: getCriticalDependencies().length, avgHealth, highRisk }
}
