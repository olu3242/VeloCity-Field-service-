export interface SLAContractBreachEvent {
  id: string
  contractId: string
  tenantId: string
  breachType: "uptime" | "response_time" | "resolution_time" | "throughput"
  slaTarget: number
  actualValue: number
  deviationPct: number
  penalty: "warning" | "credit" | "termination_risk"
  detectedAt: string
  resolved: boolean
}

const BREACHES: SLAContractBreachEvent[] = []
const BREACH_CAP = 200

export function recordBreach(
  contractId: string,
  tenantId: string,
  breachType: SLAContractBreachEvent["breachType"],
  slaTarget: number,
  actualValue: number,
): SLAContractBreachEvent {
  const deviationPct = slaTarget > 0 ? Math.abs((actualValue - slaTarget) / slaTarget) * 100 : 0
  const penalty: SLAContractBreachEvent["penalty"] =
    deviationPct > 50 ? "termination_risk" : deviationPct > 20 ? "credit" : "warning"

  const breach: SLAContractBreachEvent = {
    id: crypto.randomUUID(),
    contractId,
    tenantId,
    breachType,
    slaTarget,
    actualValue,
    deviationPct,
    penalty,
    detectedAt: new Date().toISOString(),
    resolved: false,
  }
  BREACHES.push(breach)
  if (BREACHES.length > BREACH_CAP) BREACHES.splice(0, BREACHES.length - BREACH_CAP)
  return breach
}

export function resolveBreach(id: string): void {
  const breach = BREACHES.find((b) => b.id === id)
  if (!breach) return
  breach.resolved = true
}

export function getBreachesByContract(contractId: string): SLAContractBreachEvent[] {
  return BREACHES.filter((b) => b.contractId === contractId)
}

export function getActiveBreaches(tenantId?: string): SLAContractBreachEvent[] {
  return BREACHES.filter(
    (b) => !b.resolved && (tenantId === undefined || b.tenantId === tenantId),
  )
}
