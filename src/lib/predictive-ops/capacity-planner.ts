export interface CapacityPlan {
  id: string
  resourceType: string
  currentCapacity: number
  required90DayCapacity: number
  growthRatePct: number
  recommendation: string
  costImpactUsd: number
  urgency: "low" | "medium" | "high"
  plannedAt: string
}

const PLANS: CapacityPlan[] = []
const CAP = 50

export function planCapacity(
  resourceType: string,
  currentCapacity: number,
  growthRatePct: number,
  costPerUnitUsd: number
): CapacityPlan {
  const required90DayCapacity = Math.ceil(currentCapacity * (1 + (growthRatePct / 100) * 3))
  const additionalUnits = required90DayCapacity - currentCapacity
  const costImpactUsd = additionalUnits * costPerUnitUsd

  let urgency: CapacityPlan["urgency"]
  let daysToProvision: number
  if (growthRatePct > 30) {
    urgency = "high"
    daysToProvision = 14
  } else if (growthRatePct > 15) {
    urgency = "medium"
    daysToProvision = 30
  } else {
    urgency = "low"
    daysToProvision = 60
  }

  const recommendation = `Provision ${additionalUnits} additional ${resourceType} unit(s) within ${daysToProvision} days`

  const plan: CapacityPlan = {
    id: crypto.randomUUID(),
    resourceType,
    currentCapacity,
    required90DayCapacity,
    growthRatePct,
    recommendation,
    costImpactUsd,
    urgency,
    plannedAt: new Date().toISOString(),
  }

  if (PLANS.length >= CAP) PLANS.shift()
  PLANS.push(plan)
  return plan
}

export function getCapacityPlans(): CapacityPlan[] {
  return [...PLANS]
}

export function getUrgentPlans(): CapacityPlan[] {
  return PLANS.filter(p => p.urgency === "high")
}
