import { isRuntimePaused } from "@/lib/governance/operator"

export interface OptimizationOpportunity {
  id: string
  domain: "workflow" | "cost" | "latency" | "resilience" | "queue"
  title: string
  description: string
  estimatedGainPct: number
  effortLevel: "low" | "medium" | "high"
  status: "identified" | "approved" | "implementing" | "completed" | "dismissed"
  identifiedAt: string
  completedAt?: string
}

const OPPORTUNITIES: OptimizationOpportunity[] = []
const CAP = 200

export function identifyOpportunity(
  domain: OptimizationOpportunity["domain"],
  title: string,
  description: string,
  estimatedGainPct: number,
  effortLevel: OptimizationOpportunity["effortLevel"]
): OptimizationOpportunity {
  const opp: OptimizationOpportunity = {
    id: crypto.randomUUID(),
    domain,
    title,
    description,
    estimatedGainPct,
    effortLevel,
    status: "identified",
    identifiedAt: new Date().toISOString(),
  }
  if (OPPORTUNITIES.length >= CAP) OPPORTUNITIES.shift()
  OPPORTUNITIES.push(opp)
  return opp
}

export function approveOptimization(id: string): void {
  if (isRuntimePaused()) return
  const opp = OPPORTUNITIES.find(o => o.id === id)
  if (opp && opp.status === "identified") opp.status = "approved"
}

export function completeOptimization(id: string): void {
  const opp = OPPORTUNITIES.find(o => o.id === id)
  if (opp) {
    opp.status = "completed"
    opp.completedAt = new Date().toISOString()
  }
}

export function dismissOptimization(id: string): void {
  const opp = OPPORTUNITIES.find(o => o.id === id)
  if (opp) opp.status = "dismissed"
}

export function getOpportunitiesByDomain(domain: OptimizationOpportunity["domain"]): OptimizationOpportunity[] {
  return OPPORTUNITIES.filter(o => o.domain === domain)
}

export function getTopOpportunities(limit = 10): OptimizationOpportunity[] {
  return OPPORTUNITIES
    .filter(o => o.status === "identified")
    .sort((a, b) => b.estimatedGainPct - a.estimatedGainPct)
    .slice(0, limit)
}
