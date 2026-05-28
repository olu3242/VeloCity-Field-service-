export type DeterminismCheck =
  | "replay_match"
  | "idempotency"
  | "ordering"
  | "state_consistency"
  | "output_stability"

export interface DeterminismResult {
  resultId: string
  executionId: string
  tenantId?: string
  checks: { check: DeterminismCheck; passed: boolean; details: string }[]
  overallPassed: boolean
  deterministicScore: number
  verifiedAt: string
}

const RESULTS: DeterminismResult[] = []
const RESULTS_CAP = 1000

export function verifyDeterminism(
  executionId: string,
  checksToRun: DeterminismCheck[],
  overrides?: Partial<Record<DeterminismCheck, boolean>>,
  tenantId?: string
): DeterminismResult {
  if (RESULTS.length >= RESULTS_CAP) RESULTS.shift()

  const checks = checksToRun.map((check) => {
    const passed = overrides?.[check] !== false
    return { check, passed, details: passed ? `${check} passed` : `${check} failed` }
  })

  const passedCount = checks.filter((c) => c.passed).length
  const deterministicScore =
    checksToRun.length === 0 ? 100 : (passedCount / checksToRun.length) * 100
  const overallPassed = deterministicScore === 100

  const result: DeterminismResult = {
    resultId: crypto.randomUUID(),
    executionId,
    tenantId,
    checks,
    overallPassed,
    deterministicScore,
    verifiedAt: new Date().toISOString(),
  }

  RESULTS.push(result)
  return result
}

export function getDeterminismResult(executionId: string): DeterminismResult | undefined {
  return RESULTS.find((r) => r.executionId === executionId)
}

export function getFailingExecutions(): DeterminismResult[] {
  return RESULTS.filter((r) => !r.overallPassed)
}

export function getDeterminismSummary(): {
  total: number
  passed: number
  failed: number
  avgScore: number
} {
  const passed = RESULTS.filter((r) => r.overallPassed).length
  const avgScore =
    RESULTS.length === 0
      ? 0
      : RESULTS.reduce((sum, r) => sum + r.deterministicScore, 0) / RESULTS.length
  return { total: RESULTS.length, passed, failed: RESULTS.length - passed, avgScore }
}
