export type GuardedEntityType =
  | "cognition"
  | "remediation"
  | "deployment"
  | "orchestration"
  | "escalation"

export interface ConfidenceGuardrailCheck {
  checkId: string
  entityId: string
  entityType: GuardedEntityType
  tenantId?: string
  providedConfidence: number
  requiredMinimum: number
  passed: boolean
  action: "allow" | "warn" | "block" | "require_approval"
  checkedAt: string
}

const THRESHOLDS: Record<GuardedEntityType, number> = {
  cognition: 0.5,
  remediation: 0.6,
  deployment: 0.65,
  orchestration: 0.55,
  escalation: 0.45,
}

const CHECKS: ConfidenceGuardrailCheck[] = []
const CHECKS_CAP = 1000

export function checkConfidence(
  entityId: string,
  entityType: GuardedEntityType,
  confidence: number,
  tenantId?: string
): ConfidenceGuardrailCheck {
  if (CHECKS.length >= CHECKS_CAP) CHECKS.shift()

  const requiredMinimum = THRESHOLDS[entityType]
  const passed = confidence >= requiredMinimum

  let action: ConfidenceGuardrailCheck["action"]
  if (passed && confidence >= requiredMinimum + 0.2) {
    action = "allow"
  } else if (passed) {
    action = "warn"
  } else if (confidence < requiredMinimum - 0.2) {
    action = "block"
  } else {
    action = "require_approval"
  }

  const check: ConfidenceGuardrailCheck = {
    checkId: crypto.randomUUID(),
    entityId,
    entityType,
    tenantId,
    providedConfidence: confidence,
    requiredMinimum,
    passed,
    action,
    checkedAt: new Date().toISOString(),
  }

  CHECKS.push(check)
  return check
}

export function isAllowed(
  entityId: string,
  entityType: GuardedEntityType,
  confidence: number
): boolean {
  void entityId
  return confidence >= THRESHOLDS[entityType]
}

export function getBlockedEntities(entityType?: GuardedEntityType): ConfidenceGuardrailCheck[] {
  return CHECKS.filter(
    (c) => c.action === "block" && (entityType === undefined || c.entityType === entityType)
  )
}

export function getGuardrailSummary(): {
  total: number
  allowed: number
  warned: number
  blocked: number
  requireApproval: number
} {
  let allowed = 0, warned = 0, blocked = 0, requireApproval = 0
  for (const c of CHECKS) {
    if (c.action === "allow") allowed++
    else if (c.action === "warn") warned++
    else if (c.action === "block") blocked++
    else requireApproval++
  }
  return { total: CHECKS.length, allowed, warned, blocked, requireApproval }
}
