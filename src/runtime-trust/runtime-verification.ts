import { logger } from "@/runtime-core/observability"
import { getProvenance, validateProvenance } from "./execution-provenance"
import { validateIdentity } from "./workload-identity"
import { getTrustScore } from "./trust-score"

export interface VerificationResult {
  verificationId: string
  executionId: string
  tenantId?: string
  checks: {
    checkName: string
    passed: boolean
    details: string
  }[]
  overallPassed: boolean
  verifiedAt: string
}

const VERIFICATION_LOG: VerificationResult[] = []
const CAP = 1000

export function verifyExecution(executionId: string, tenantId?: string): VerificationResult {
  const checks: VerificationResult["checks"] = []

  const provenance = getProvenance(executionId)
  if (!provenance) {
    checks.push({ checkName: "provenance_exists", passed: false, details: "No provenance record found for execution" })
  } else {
    checks.push({ checkName: "provenance_exists", passed: true, details: `Chain length: ${provenance.chain.length}` })
  }

  const rootId = provenance?.rootIdentityId
  if (!rootId) {
    checks.push({ checkName: "identity_valid", passed: false, details: "Cannot determine root identity without provenance" })
  } else {
    const idCheck = validateIdentity(rootId)
    checks.push({
      checkName: "identity_valid",
      passed: idCheck.valid,
      details: idCheck.valid ? `Identity ${rootId} is valid` : (idCheck.reason ?? "Invalid"),
    })
  }

  if (!rootId) {
    checks.push({ checkName: "trust_sufficient", passed: false, details: "No root identity to evaluate trust for" })
  } else {
    const ts = getTrustScore(rootId)
    const trustOk = (ts?.score ?? 0) >= 50
    checks.push({
      checkName: "trust_sufficient",
      passed: trustOk,
      details: ts ? `Trust score ${ts.score} [${ts.level}]` : "No trust score on record",
    })
  }

  if (!provenance) {
    checks.push({ checkName: "packet_integrity", passed: false, details: "Cannot verify packet integrity without provenance" })
  } else {
    const provenanceCheck = validateProvenance(executionId)
    checks.push({
      checkName: "packet_integrity",
      passed: provenanceCheck.valid,
      details: provenanceCheck.valid ? "Provenance chain integrity confirmed" : provenanceCheck.issues.join("; "),
    })
  }

  const overallPassed = checks.every((c) => c.passed)
  const result: VerificationResult = {
    verificationId: crypto.randomUUID(),
    executionId,
    tenantId,
    checks,
    overallPassed,
    verifiedAt: new Date().toISOString(),
  }
  if (VERIFICATION_LOG.length >= CAP) VERIFICATION_LOG.shift()
  VERIFICATION_LOG.push(result)
  logger.info(`Execution verified: ${executionId} passed=${overallPassed}`, "runtime-verification", { tenantId })
  return result
}

export function getVerificationResult(executionId: string): VerificationResult | undefined {
  for (let i = VERIFICATION_LOG.length - 1; i >= 0; i--) {
    if (VERIFICATION_LOG[i]?.executionId === executionId) return VERIFICATION_LOG[i]
  }
  return undefined
}

export function getVerificationStats(): {
  total: number; passed: number; failed: number; passRate: number
} {
  let passed = 0
  for (const v of VERIFICATION_LOG) {
    if (v.overallPassed) passed++
  }
  const total = VERIFICATION_LOG.length
  return { total, passed, failed: total - passed, passRate: total > 0 ? passed / total : 0 }
}
