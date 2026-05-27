/**
 * Scenario Runner — creates and executes operational simulation scenarios.
 * In-memory singleton with rolling cap of 50 entries. Pure math, no side effects.
 */

const SCENARIOS_CAP = 50

export type ScenarioType =
  | "load_spike"
  | "region_failure"
  | "agent_degradation"
  | "queue_flood"
  | "tenant_churn"
  | "payment_cascade"

export interface SimulationScenario {
  id: string
  scenarioType: ScenarioType
  parameters: Record<string, unknown>
  status: "pending" | "running" | "completed" | "aborted"
  startedAt: string
  completedAt?: string
  results?: Record<string, unknown>
}

const SCENARIOS: SimulationScenario[] = []

function enforceCap(): void {
  while (SCENARIOS.length > SCENARIOS_CAP) SCENARIOS.shift()
}

function simulateResults(
  scenarioType: ScenarioType,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const intensityRaw = parameters["intensity"]
  const intensity = typeof intensityRaw === "number" ? intensityRaw : 0.5
  switch (scenarioType) {
    case "load_spike":
      return { peakThroughput: Math.round(1000 * intensity), p99LatencyMs: Math.round(500 * intensity), droppedRequests: Math.round(50 * intensity) }
    case "region_failure":
      return { affectedTenants: Math.round(100 * intensity), failoverTimeMs: Math.round(30_000 * intensity), dataLossRisk: intensity < 0.5 ? "none" : "low" }
    case "agent_degradation":
      return { degradedAgents: Math.round(10 * intensity), automationCoverage: Math.round((1 - intensity * 0.4) * 100) }
    case "queue_flood":
      return { queueDepth: Math.round(10_000 * intensity), processingLagMs: Math.round(60_000 * intensity), backpressureTriggered: intensity > 0.6 }
    case "tenant_churn":
      return { churningTenants: Math.round(20 * intensity), revenueImpactUsd: Math.round(50_000 * intensity) }
    case "payment_cascade":
      return { failedPayments: Math.round(500 * intensity), retryStormRequests: Math.round(2000 * intensity), disputeEstimate: Math.round(50 * intensity) }
  }
}

export function createScenario(
  scenarioType: ScenarioType,
  parameters: Record<string, unknown>
): SimulationScenario {
  enforceCap()
  const scenario: SimulationScenario = {
    id: crypto.randomUUID(),
    scenarioType,
    parameters,
    status: "pending",
    startedAt: new Date().toISOString(),
  }
  SCENARIOS.push(scenario)
  return scenario
}

export function runScenario(id: string): SimulationScenario {
  const scenario = SCENARIOS.find((s) => s.id === id)
  if (!scenario) throw new Error(`Scenario not found: ${id}`)
  scenario.status = "running"
  const results = simulateResults(scenario.scenarioType, scenario.parameters)
  scenario.status = "completed"
  scenario.completedAt = new Date().toISOString()
  scenario.results = results
  return scenario
}

export function getScenario(id: string): SimulationScenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

export function getRecentScenarios(limit = 10): SimulationScenario[] {
  return SCENARIOS.slice(-limit)
}
