import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type CognitionTraceLevel =
  | "decision"
  | "recommendation"
  | "prediction"
  | "arbitration"
  | "learning"

export interface CognitionTraceStandard {
  standardId: string
  traceLevel: CognitionTraceLevel
  requiredFields: string[]
  confidenceRange: { min: number; max: number }
  explainabilityRequired: boolean
  lineageRequired: boolean
  tenantSafe: boolean
  registeredAt: string
}

const STANDARDS: Map<string, CognitionTraceStandard> = new Map()
const MAX_STANDARDS = 100

export function registerCognitionStandard(
  level: CognitionTraceLevel,
  required: string[],
  options?: {
    confidenceRange?: { min: number; max: number }
    explainabilityRequired?: boolean
    lineageRequired?: boolean
    tenantSafe?: boolean
  }
): CognitionTraceStandard {
  if (isRuntimePaused()) {
    logger.warn("registerCognitionStandard blocked: runtime paused", "cognition-standards")
    throw new Error("Runtime is paused")
  }
  if (STANDARDS.size >= MAX_STANDARDS) {
    const firstKey = STANDARDS.keys().next().value as string
    STANDARDS.delete(firstKey)
  }
  const standard: CognitionTraceStandard = {
    standardId: crypto.randomUUID(),
    traceLevel: level,
    requiredFields: required,
    confidenceRange: options?.confidenceRange ?? { min: 0, max: 1 },
    explainabilityRequired: options?.explainabilityRequired ?? false,
    lineageRequired: options?.lineageRequired ?? false,
    tenantSafe: options?.tenantSafe ?? true,
    registeredAt: new Date().toISOString(),
  }
  STANDARDS.set(level, standard)
  logger.info(`Cognition standard registered: ${level}`, "cognition-standards")
  return standard
}

export function validateCognitionTrace(
  level: CognitionTraceLevel,
  trace: Record<string, unknown>
): { valid: boolean; issues: string[] } {
  const standard = STANDARDS.get(level)
  if (!standard) return { valid: false, issues: ["cognition_level_not_registered"] }
  const issues: string[] = []
  for (const field of standard.requiredFields) {
    if (!(field in trace)) issues.push(`missing required field: ${field}`)
  }
  if ("confidence" in trace) {
    const conf = trace.confidence
    if (typeof conf === "number") {
      if (conf < standard.confidenceRange.min || conf > standard.confidenceRange.max) {
        issues.push(`confidence ${conf} outside range [${standard.confidenceRange.min}, ${standard.confidenceRange.max}]`)
      }
    }
  }
  return { valid: issues.length === 0, issues }
}

export function getStandard(level: CognitionTraceLevel): CognitionTraceStandard | undefined {
  return STANDARDS.get(level)
}

export function getStandardsSummary(): {
  total: number
  explainabilityRequired: number
  lineageRequired: number
} {
  const values = Array.from(STANDARDS.values())
  return {
    total: values.length,
    explainabilityRequired: values.filter((s) => s.explainabilityRequired).length,
    lineageRequired: values.filter((s) => s.lineageRequired).length,
  }
}

// Pre-register all 5 trace levels
type LevelEntry = [CognitionTraceLevel, string[], boolean, boolean]
const CORE_LEVELS: LevelEntry[] = [
  ["decision", ["domain", "confidence", "reasonedAt", "decision"], true, true],
  ["recommendation", ["domain", "confidence", "reasonedAt", "recommendation"], true, false],
  ["prediction", ["domain", "confidence", "reasonedAt", "prediction"], false, false],
  ["arbitration", ["domain", "confidence", "reasonedAt", "arbitrationResult"], true, true],
  ["learning", ["domain", "confidence", "reasonedAt", "learningOutcome"], false, true],
]

for (const [level, required, explainabilityRequired, lineageRequired] of CORE_LEVELS) {
  STANDARDS.set(level, {
    standardId: crypto.randomUUID(),
    traceLevel: level,
    requiredFields: required,
    confidenceRange: { min: 0, max: 1 },
    explainabilityRequired,
    lineageRequired,
    tenantSafe: true,
    registeredAt: new Date().toISOString(),
  })
}
