/**
 * Playbook Engine — stores and manages operational playbooks per scenario type.
 * Pre-registers playbooks for all 6 scenario types.
 */

import type { ScenarioType } from "./scenario-runner"

export interface Playbook {
  id: string
  name: string
  scenarioType: ScenarioType
  steps: string[]
  estimatedRuntimeMs: number
  successCriteria: string
  lastRunAt?: string
  lastRunResult?: "success" | "failure"
}

const PLAYBOOKS: Map<string, Playbook> = new Map()

const DEFAULT_PLAYBOOKS: Playbook[] = [
  {
    id: crypto.randomUUID(),
    name: "Load Spike Response",
    scenarioType: "load_spike",
    steps: ["activate auto-scaling", "shed low-priority traffic", "notify on-call", "monitor p99 latency", "scale down after recovery"],
    estimatedRuntimeMs: 300_000,
    successCriteria: "p99 latency < 500ms for 5 consecutive minutes",
  },
  {
    id: crypto.randomUUID(),
    name: "Region Failure Failover",
    scenarioType: "region_failure",
    steps: ["detect region health", "initiate DNS failover", "warm up standby region", "replay in-flight events", "validate tenant connectivity"],
    estimatedRuntimeMs: 600_000,
    successCriteria: "All tenants restored with < 1% data loss",
  },
  {
    id: crypto.randomUUID(),
    name: "Agent Degradation Recovery",
    scenarioType: "agent_degradation",
    steps: ["identify degraded agents", "redistribute workloads", "restart failed agents", "run health checks", "restore automation coverage"],
    estimatedRuntimeMs: 180_000,
    successCriteria: "Automation coverage > 90% within 3 minutes",
  },
  {
    id: crypto.randomUUID(),
    name: "Queue Flood Mitigation",
    scenarioType: "queue_flood",
    steps: ["enable backpressure", "drain oldest messages first", "scale queue consumers", "alert on DLQ growth", "resume normal processing"],
    estimatedRuntimeMs: 240_000,
    successCriteria: "Queue depth < 1000 and lag < 5s",
  },
  {
    id: crypto.randomUUID(),
    name: "Tenant Churn Containment",
    scenarioType: "tenant_churn",
    steps: ["identify churning tenants", "trigger retention workflows", "notify account managers", "generate offboarding reports", "archive tenant data"],
    estimatedRuntimeMs: 120_000,
    successCriteria: "Churn rate reduced below 2% threshold",
  },
  {
    id: crypto.randomUUID(),
    name: "Payment Cascade Halt",
    scenarioType: "payment_cascade",
    steps: ["pause payment processing", "identify root cause", "fix integration issue", "replay failed payments", "notify affected tenants"],
    estimatedRuntimeMs: 360_000,
    successCriteria: "Payment success rate > 99% for 10 consecutive minutes",
  },
]

for (const pb of DEFAULT_PLAYBOOKS) {
  PLAYBOOKS.set(pb.scenarioType, pb)
}

export function getPlaybook(scenarioType: ScenarioType): Playbook | undefined {
  return PLAYBOOKS.get(scenarioType)
}

export function registerPlaybook(playbook: Playbook): void {
  PLAYBOOKS.set(playbook.scenarioType, playbook)
}

export function recordPlaybookRun(id: string, result: "success" | "failure"): void {
  for (const pb of Array.from(PLAYBOOKS.values())) {
    if (pb.id === id) {
      pb.lastRunAt = new Date().toISOString()
      pb.lastRunResult = result
      break
    }
  }
}

export function getAllPlaybooks(): Playbook[] {
  return Array.from(PLAYBOOKS.values())
}
