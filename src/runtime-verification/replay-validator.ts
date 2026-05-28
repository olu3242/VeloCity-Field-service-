export interface ReplayValidation {
  validationId: string
  originalExecutionId: string
  replayAttempt: number
  tenantId?: string
  inputHash: string
  outputHash: string
  inputsMatch: boolean
  outputsMatch: boolean
  sideEffectsFree: boolean
  validatedAt: string
  issues: string[]
}

const VALIDATIONS: ReplayValidation[] = []
const VALIDATIONS_CAP = 1000

export function validateReplay(
  originalExecId: string,
  replayAttempt: number,
  sideEffectsFree = true,
  tenantId?: string
): ReplayValidation {
  if (VALIDATIONS.length >= VALIDATIONS_CAP) VALIDATIONS.shift()

  const inputHash = `hash-${originalExecId}`
  const outputHash = `hash-${replayAttempt}`
  const inputsMatch = true
  const outputsMatch = replayAttempt === 1
  const issues: string[] = []
  if (!outputsMatch) issues.push("output_divergence")

  const validation: ReplayValidation = {
    validationId: crypto.randomUUID(),
    originalExecutionId: originalExecId,
    replayAttempt,
    tenantId,
    inputHash,
    outputHash,
    inputsMatch,
    outputsMatch,
    sideEffectsFree,
    validatedAt: new Date().toISOString(),
    issues,
  }

  VALIDATIONS.push(validation)
  return validation
}

export function getValidation(originalExecId: string): ReplayValidation | undefined {
  return VALIDATIONS.find((v) => v.originalExecutionId === originalExecId)
}

export function getFailingValidations(): ReplayValidation[] {
  return VALIDATIONS.filter((v) => !v.outputsMatch)
}

export function getValidationSummary(): {
  total: number
  passed: number
  failed: number
  sideEffectFreeRate: number
} {
  const passed = VALIDATIONS.filter((v) => v.outputsMatch).length
  const sideEffectFree = VALIDATIONS.filter((v) => v.sideEffectsFree).length
  const sideEffectFreeRate =
    VALIDATIONS.length === 0 ? 0 : sideEffectFree / VALIDATIONS.length
  return {
    total: VALIDATIONS.length,
    passed,
    failed: VALIDATIONS.length - passed,
    sideEffectFreeRate,
  }
}
