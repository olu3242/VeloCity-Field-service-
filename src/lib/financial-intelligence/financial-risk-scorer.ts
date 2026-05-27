export interface FinancialRiskScore {
  tenantId: string
  riskScore: number
  riskLevel: "low" | "medium" | "high" | "critical"
  factors: { factor: string; contribution: number }[]
  scoredAt: string
}

const SCORES: Map<string, FinancialRiskScore> = new Map()

export function scoreFinancialRisk(
  tenantId: string,
  params: {
    disputeRate: number
    chargebackRate: number
    outstandingBalanceUsd: number
    daysSinceLastPayment: number
  },
): FinancialRiskScore {
  const disputeContrib = params.disputeRate * 40
  const chargebackContrib = params.chargebackRate * 30
  const paymentContrib = (params.daysSinceLastPayment / 30) * 15
  const balanceContrib = (params.outstandingBalanceUsd / 10000) * 15

  const raw = disputeContrib + chargebackContrib + paymentContrib + balanceContrib
  const riskScore = Math.min(100, Math.max(0, raw))

  const riskLevel: FinancialRiskScore["riskLevel"] =
    riskScore < 25 ? "low" : riskScore < 50 ? "medium" : riskScore < 75 ? "high" : "critical"

  const score: FinancialRiskScore = {
    tenantId,
    riskScore,
    riskLevel,
    factors: [
      { factor: "dispute_rate", contribution: disputeContrib },
      { factor: "chargeback_rate", contribution: chargebackContrib },
      { factor: "days_since_payment", contribution: paymentContrib },
      { factor: "outstanding_balance", contribution: balanceContrib },
    ],
    scoredAt: new Date().toISOString(),
  }
  SCORES.set(tenantId, score)
  return score
}

export function getRiskScore(tenantId: string): FinancialRiskScore | undefined {
  return SCORES.get(tenantId)
}

export function getHighRiskTenants(threshold = 50): FinancialRiskScore[] {
  return Array.from(SCORES.values()).filter((s) => s.riskScore >= threshold)
}
