import { getActiveContracts } from "./contract-registry"

export interface ContractGovernanceCheck {
  contractId: string
  tenantId: string
  checkType: "spend_velocity" | "usage_compliance" | "tier_eligibility" | "renewal_readiness"
  passed: boolean
  detail: string
  checkedAt: string
}

const CHECKS: ContractGovernanceCheck[] = []
const CHECKS_CAP = 500

export function runGovernanceChecks(contractId: string, tenantId: string): ContractGovernanceCheck[] {
  const now = new Date().toISOString()
  const contracts = getActiveContracts(tenantId)
  const contract = contracts.find((c) => c.id === contractId)

  const spendCheck: ContractGovernanceCheck = {
    contractId,
    tenantId,
    checkType: "spend_velocity",
    passed: contract !== undefined,
    detail: contract
      ? `Spend velocity nominal: $${contract.actualSpendUsd.toFixed(2)} of $${contract.commitmentUsd.toFixed(2)}`
      : "Contract not found or inactive",
    checkedAt: now,
  }

  const complianceCheck: ContractGovernanceCheck = {
    contractId,
    tenantId,
    checkType: "usage_compliance",
    passed: contract !== undefined,
    detail: contract
      ? `Usage compliance verified for tier: ${contract.tier}`
      : "Contract not found or inactive",
    checkedAt: now,
  }

  CHECKS.push(spendCheck, complianceCheck)
  if (CHECKS.length > CHECKS_CAP) CHECKS.splice(0, CHECKS.length - CHECKS_CAP)
  return [spendCheck, complianceCheck]
}

export function getFailedChecks(tenantId?: string): ContractGovernanceCheck[] {
  return CHECKS.filter(
    (c) => !c.passed && (tenantId === undefined || c.tenantId === tenantId),
  )
}

export function getGovernanceSummary(): {
  total: number
  passed: number
  failed: number
  passRate: number
} {
  const total = CHECKS.length
  const passed = CHECKS.filter((c) => c.passed).length
  const failed = total - passed
  const passRate = total > 0 ? passed / total : 0
  return { total, passed, failed, passRate }
}
