import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederationStandard {
  standardId: string
  exchangeType: string
  requiredHeaders: string[]
  maxPayloadKb: number
  signatureRequired: boolean
  tenantIsolationRequired: boolean
  encryptionRequired: boolean
  replaySafe: boolean
  registeredAt: string
}

const STANDARDS: Map<string, FederationStandard> = new Map()
const MAX_STANDARDS = 100

export function registerFederationStandard(
  exchangeType: string,
  requiredHeaders: string[],
  maxKb: number,
  options?: {
    signatureRequired?: boolean
    tenantIsolationRequired?: boolean
    encryptionRequired?: boolean
    replaySafe?: boolean
  }
): FederationStandard {
  if (isRuntimePaused()) {
    logger.warn("registerFederationStandard blocked: runtime paused", "federation-standards")
    throw new Error("Runtime is paused")
  }
  if (STANDARDS.size >= MAX_STANDARDS) {
    const oldest = Array.from(STANDARDS.keys())[0]
    if (oldest !== undefined) STANDARDS.delete(oldest)
  }
  const standard: FederationStandard = {
    standardId: crypto.randomUUID(),
    exchangeType,
    requiredHeaders,
    maxPayloadKb: maxKb,
    signatureRequired: options?.signatureRequired ?? false,
    tenantIsolationRequired: options?.tenantIsolationRequired ?? false,
    encryptionRequired: options?.encryptionRequired ?? false,
    replaySafe: options?.replaySafe ?? false,
    registeredAt: new Date().toISOString(),
  }
  STANDARDS.set(exchangeType, standard)
  logger.info(`Federation standard registered: ${exchangeType}`, "federation-standards")
  return standard
}

export function validateFederationPacket(
  exchangeType: string,
  packet: Record<string, unknown>
): { valid: boolean; violations: string[] } {
  const standard = STANDARDS.get(exchangeType)
  if (!standard) {
    return { valid: false, violations: [`Unknown exchangeType: ${exchangeType}`] }
  }
  const violations: string[] = []
  for (const header of standard.requiredHeaders) {
    if (!(header in packet)) {
      violations.push(`Missing required header: ${header}`)
    }
  }
  return { valid: violations.length === 0, violations }
}

export function getStandard(exchangeType: string): FederationStandard | undefined {
  return STANDARDS.get(exchangeType)
}

export function getFederationSummary(): {
  total: number
  signatureRequired: number
  tenantIsolationRequired: number
} {
  const values = Array.from(STANDARDS.values())
  return {
    total: values.length,
    signatureRequired: values.filter((s) => s.signatureRequired).length,
    tenantIsolationRequired: values.filter((s) => s.tenantIsolationRequired).length,
  }
}

// Pre-register 4 core federation standards
const CORE_STANDARDS: [string, string[], number][] = [
  ["signal_relay", ["traceId", "correlationId", "sourceNodeId"], 64],
  ["model_sync", ["traceId", "version", "sourceNodeId"], 512],
  ["cognition_share", ["traceId", "domain", "confidence"], 128],
  ["intelligence_broadcast", ["traceId", "signalType"], 256],
]

for (const [exchangeType, requiredHeaders, maxKb] of CORE_STANDARDS) {
  const standard: FederationStandard = {
    standardId: crypto.randomUUID(),
    exchangeType,
    requiredHeaders,
    maxPayloadKb: maxKb,
    signatureRequired: true,
    tenantIsolationRequired: true,
    encryptionRequired: false,
    replaySafe: true,
    registeredAt: new Date().toISOString(),
  }
  STANDARDS.set(exchangeType, standard)
}
