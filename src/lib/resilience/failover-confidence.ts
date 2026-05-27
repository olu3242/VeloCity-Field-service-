export interface FailoverTest {
  id: string;
  scenario: string;
  confidenceScore: number;
  testedAt: string;
  passed: boolean;
  notes: string;
}

export const TESTS: FailoverTest[] = [];
const CAP = 100;

export function recordFailoverTest(
  scenario: string,
  confidenceScore: number,
  passed: boolean,
  notes: string
): FailoverTest {
  const test: FailoverTest = {
    id: crypto.randomUUID(),
    scenario,
    confidenceScore,
    testedAt: new Date().toISOString(),
    passed,
    notes,
  };
  TESTS.push(test);
  if (TESTS.length > CAP) TESTS.shift();
  return test;
}

export function getOverallConfidence(): number {
  const passedTests = TESTS.filter((t) => t.passed);
  if (passedTests.length === 0) return 0;
  return (
    passedTests.reduce((s, t) => s + t.confidenceScore, 0) / passedTests.length
  );
}

export function getFailedTests(): FailoverTest[] {
  return TESTS.filter((t) => !t.passed);
}

export function getConfidenceSummary(): {
  total: number;
  passed: number;
  failed: number;
  avgConfidence: number;
} {
  const total = TESTS.length;
  const passed = TESTS.filter((t) => t.passed).length;
  const failed = total - passed;
  const avgConfidence = getOverallConfidence();
  return { total, passed, failed, avgConfidence };
}
