export interface FailureDependency {
  id: string;
  failedComponent: string;
  dependentComponents: string[];
  cascadeRisk: "low" | "medium" | "high";
  detectedAt: string;
  resolved: boolean;
}

export const FAILURES: FailureDependency[] = [];
const CAP = 100;

export function recordFailure(
  failedComponent: string,
  dependentComponents: string[],
  cascadeRisk: "low" | "medium" | "high"
): FailureDependency {
  const failure: FailureDependency = {
    id: crypto.randomUUID(),
    failedComponent,
    dependentComponents,
    cascadeRisk,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };
  FAILURES.push(failure);
  if (FAILURES.length > CAP) FAILURES.shift();
  return failure;
}

export function resolveFailure(id: string): void {
  const failure = FAILURES.find((f) => f.id === id);
  if (!failure) return;
  failure.resolved = true;
}

export function getActiveFailures(): FailureDependency[] {
  return FAILURES.filter((f) => !f.resolved);
}

export function getHighCascadeRisks(): FailureDependency[] {
  return FAILURES.filter((f) => f.cascadeRisk === "high" && !f.resolved);
}
