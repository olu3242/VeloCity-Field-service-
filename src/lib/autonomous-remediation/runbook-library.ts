export interface Runbook {
  id: string
  incidentType: string
  name: string
  steps: string[]
  estimatedResolutionMs: number
  requiresHumanApproval: boolean
  lastUsedAt?: string
  useCount: number
}

const RUNBOOKS: Map<string, Runbook> = new Map()

const PRE_REGISTERED: Omit<Runbook, "useCount">[] = [
  {
    id: crypto.randomUUID(),
    incidentType: "circuit_cascade",
    name: "Circuit Cascade Recovery",
    steps: ["Identify root circuit", "Reset half-open circuits", "Monitor traffic recovery", "Alert on-call engineer"],
    estimatedResolutionMs: 900_000,
    requiresHumanApproval: true,
  },
  {
    id: crypto.randomUUID(),
    incidentType: "queue_overflow",
    name: "Queue Overflow Drain",
    steps: ["Pause ingestion", "Scale workers", "Drain queue", "Resume ingestion", "Monitor depth"],
    estimatedResolutionMs: 300_000,
    requiresHumanApproval: false,
  },
  {
    id: crypto.randomUUID(),
    incidentType: "agent_failure",
    name: "Agent Failure Recovery",
    steps: ["Identify failed agent", "Check error logs", "Restart agent process", "Verify health check"],
    estimatedResolutionMs: 180_000,
    requiresHumanApproval: false,
  },
  {
    id: crypto.randomUUID(),
    incidentType: "latency_spike",
    name: "Latency Spike Mitigation",
    steps: ["Enable fast-path routing", "Shed non-critical load", "Identify slow dependency", "Apply timeout overrides"],
    estimatedResolutionMs: 600_000,
    requiresHumanApproval: false,
  },
  {
    id: crypto.randomUUID(),
    incidentType: "payment_degradation",
    name: "Payment Degradation Recovery",
    steps: ["Switch to backup payment provider", "Queue failed transactions", "Alert finance team", "Retry queued payments"],
    estimatedResolutionMs: 1_200_000,
    requiresHumanApproval: true,
  },
]

for (const rb of PRE_REGISTERED) {
  RUNBOOKS.set(rb.incidentType, { ...rb, useCount: 0 })
}

export function getRunbook(incidentType: string): Runbook | undefined {
  return RUNBOOKS.get(incidentType)
}

export function registerRunbook(runbook: Runbook): void {
  RUNBOOKS.set(runbook.incidentType, runbook)
}

export function recordRunbookUse(incidentType: string): void {
  const rb = RUNBOOKS.get(incidentType)
  if (!rb) return
  rb.useCount++
  rb.lastUsedAt = new Date().toISOString()
}

export function getRunbookLibrary(): Runbook[] {
  return Array.from(RUNBOOKS.values())
}
