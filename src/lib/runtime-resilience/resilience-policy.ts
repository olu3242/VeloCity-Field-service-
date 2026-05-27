/**
 * Resilience Policy — defines auto-remediation policies for runtime conditions.
 * In-memory singleton with 3 pre-registered defaults.
 */

export interface ResiliencePolicy {
  policyId: string
  name: string
  component: string
  triggerCondition: "heartbeat_stale" | "error_rate_high" | "circuit_open" | "queue_depth_critical"
  autoRemediate: boolean
  remediationAction: "restart" | "failover" | "alert_only" | "scale_up"
  cooldownMs: number
  lastTriggeredAt?: string
}

const POLICIES: Map<string, ResiliencePolicy> = new Map()

const DEFAULTS: ResiliencePolicy[] = [
  {
    policyId: "worker-heartbeat-recovery",
    name: "Worker Heartbeat Recovery",
    component: "worker-pool",
    triggerCondition: "heartbeat_stale",
    autoRemediate: true,
    remediationAction: "restart",
    cooldownMs: 60_000,
  },
  {
    policyId: "circuit-flood-protection",
    name: "Circuit Flood Protection",
    component: "*",
    triggerCondition: "circuit_open",
    autoRemediate: true,
    remediationAction: "alert_only",
    cooldownMs: 30_000,
  },
  {
    policyId: "queue-drain-critical",
    name: "Queue Drain Critical",
    component: "queue-processor",
    triggerCondition: "queue_depth_critical",
    autoRemediate: true,
    remediationAction: "queue_drain" as ResiliencePolicy["remediationAction"],
    cooldownMs: 120_000,
  },
]

for (const p of DEFAULTS) {
  POLICIES.set(p.policyId, p)
}

export function registerPolicy(policy: ResiliencePolicy): void {
  POLICIES.set(policy.policyId, policy)
}

export function evaluatePolicies(
  component: string,
  condition: ResiliencePolicy["triggerCondition"]
): ResiliencePolicy[] {
  const now = Date.now()
  return Array.from(POLICIES.values()).filter((p) => {
    const matchesComponent = p.component === "*" || p.component === component
    const matchesCondition = p.triggerCondition === condition
    const cooledDown =
      p.lastTriggeredAt === undefined ||
      now - new Date(p.lastTriggeredAt).getTime() >= p.cooldownMs
    return matchesComponent && matchesCondition && cooledDown
  })
}

export function triggerPolicy(policyId: string): ResiliencePolicy | undefined {
  const policy = POLICIES.get(policyId)
  if (!policy) return undefined
  policy.lastTriggeredAt = new Date().toISOString()
  return policy
}

export function getActivePolicies(): ResiliencePolicy[] {
  return Array.from(POLICIES.values())
}
