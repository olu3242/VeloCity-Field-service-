export interface CognitionValidation {
  validationId: string
  cognitionId: string
  domain: string
  tenantId?: string
  confidence: number
  confidenceValid: boolean
  lineagePresent: boolean
  explainabilityPresent: boolean
  replaySafe: boolean
  standardsCompliant: boolean
  issues: string[]
  validatedAt: string
}

const VALIDATIONS: CognitionValidation[] = []
const VALIDATIONS_CAP = 1000

export function validateCognition(
  cognitionId: string,
  domain: string,
  confidence: number,
  hasLineage: boolean,
  hasExplainability: boolean,
  tenantId?: string
): CognitionValidation {
  if (VALIDATIONS.length >= VALIDATIONS_CAP) VALIDATIONS.shift()

  const confidenceValid = confidence >= 0 && confidence <= 1
  const replaySafe = confidence >= 0.5
  const standardsCompliant = confidenceValid && replaySafe
  const issues: string[] = []
  if (!confidenceValid) issues.push("invalid_confidence")
  if (!replaySafe) issues.push("below_replay_threshold")

  const validation: CognitionValidation = {
    validationId: crypto.randomUUID(),
    cognitionId,
    domain,
    tenantId,
    confidence,
    confidenceValid,
    lineagePresent: hasLineage,
    explainabilityPresent: hasExplainability,
    replaySafe,
    standardsCompliant,
    issues,
    validatedAt: new Date().toISOString(),
  }

  VALIDATIONS.push(validation)
  return validation
}

export function getValidation(cognitionId: string): CognitionValidation | undefined {
  return VALIDATIONS.find((v) => v.cognitionId === cognitionId)
}

export function getNonCompliantCognitions(): CognitionValidation[] {
  return VALIDATIONS.filter((v) => !v.standardsCompliant)
}

export function getCognitionValidationSummary(): {
  total: number
  compliant: number
  avgConfidence: number
} {
  const compliant = VALIDATIONS.filter((v) => v.standardsCompliant).length
  const avgConfidence =
    VALIDATIONS.length === 0
      ? 0
      : VALIDATIONS.reduce((sum, v) => sum + v.confidence, 0) / VALIDATIONS.length
  return { total: VALIDATIONS.length, compliant, avgConfidence }
}
