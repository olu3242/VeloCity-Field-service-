export interface EnterpriseContract {
  id: string
  tenantId: string
  contractType: "sla" | "volume_commitment" | "custom_terms" | "franchise"
  tier: "standard" | "premium" | "enterprise" | "franchise"
  status: "draft" | "active" | "suspended" | "expired" | "terminated"
  startDate: string
  endDate: string
  commitmentUsd: number
  actualSpendUsd: number
  terms: Record<string, unknown>
  createdAt: string
}

const CONTRACTS: Map<string, EnterpriseContract> = new Map()
const CONTRACT_CAP = 500

export function registerContract(
  tenantId: string,
  contractType: EnterpriseContract["contractType"],
  tier: EnterpriseContract["tier"],
  startDate: string,
  endDate: string,
  commitmentUsd: number,
  terms: Record<string, unknown> = {},
): EnterpriseContract {
  if (CONTRACTS.size >= CONTRACT_CAP) {
    const oldest = Array.from(CONTRACTS.keys())[0]
    if (oldest) CONTRACTS.delete(oldest)
  }
  const contract: EnterpriseContract = {
    id: crypto.randomUUID(),
    tenantId,
    contractType,
    tier,
    status: "draft",
    startDate,
    endDate,
    commitmentUsd,
    actualSpendUsd: 0,
    terms,
    createdAt: new Date().toISOString(),
  }
  CONTRACTS.set(contract.id, contract)
  return contract
}

export function updateContractStatus(id: string, status: EnterpriseContract["status"]): void {
  const c = CONTRACTS.get(id)
  if (!c) return
  CONTRACTS.set(id, { ...c, status })
}

export function recordSpend(id: string, amount: number): void {
  const c = CONTRACTS.get(id)
  if (!c) return
  CONTRACTS.set(id, { ...c, actualSpendUsd: c.actualSpendUsd + amount })
}

export function getActiveContracts(tenantId?: string): EnterpriseContract[] {
  return Array.from(CONTRACTS.values()).filter(
    (c) => c.status === "active" && (tenantId === undefined || c.tenantId === tenantId),
  )
}

export function getAtRiskContracts(): EnterpriseContract[] {
  const now = new Date().toISOString()
  return Array.from(CONTRACTS.values()).filter(
    (c) =>
      c.status === "active" &&
      c.endDate > now &&
      c.actualSpendUsd < c.commitmentUsd * 0.6,
  )
}

export function getContractSummary(): {
  total: number
  active: number
  atRisk: number
  totalCommitmentUsd: number
  totalSpendUsd: number
} {
  const all = Array.from(CONTRACTS.values())
  const active = all.filter((c) => c.status === "active").length
  const atRisk = getAtRiskContracts().length
  const totalCommitmentUsd = all.reduce((s, c) => s + c.commitmentUsd, 0)
  const totalSpendUsd = all.reduce((s, c) => s + c.actualSpendUsd, 0)
  return { total: all.length, active, atRisk, totalCommitmentUsd, totalSpendUsd }
}
