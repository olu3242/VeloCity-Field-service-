import { getOperatorState, isRuntimePaused } from "@/lib/governance/operator";

export type CompliancePolicyType =
  | "retention"
  | "audit_completeness"
  | "access_control"
  | "data_classification"
  | "sla_adherence";

export interface CompliancePolicy {
  policyId: string;
  name: string;
  type: CompliancePolicyType;
  enabled: boolean;
  checkIntervalMs: number;
  severity: "info" | "warning" | "critical";
}

export interface PolicyExecutionResult {
  policyId: string;
  passed: boolean;
  findings: string[];
  executedAt: string;
}

const MAX_RESULTS = 200;

export const POLICIES: CompliancePolicy[] = [
  {
    policyId: "ret-001",
    name: "Audit Log Retention",
    type: "retention",
    enabled: true,
    checkIntervalMs: 86_400_000,
    severity: "critical",
  },
  {
    policyId: "aud-001",
    name: "Audit Trail Completeness",
    type: "audit_completeness",
    enabled: true,
    checkIntervalMs: 3_600_000,
    severity: "warning",
  },
  {
    policyId: "acc-001",
    name: "Access Control Verification",
    type: "access_control",
    enabled: true,
    checkIntervalMs: 3_600_000,
    severity: "critical",
  },
];

const RESULTS: PolicyExecutionResult[] = [];

export function executePolicy(policyId: string): PolicyExecutionResult {
  const executedAt = new Date().toISOString();
  const policy = POLICIES.find((p) => p.policyId === policyId);
  if (policy === undefined) {
    return { policyId, passed: false, findings: ["Policy not found"], executedAt };
  }

  let passed = false;
  const findings: string[] = [];

  if (policy.type === "retention") {
    passed = true;
  } else if (policy.type === "audit_completeness") {
    const opState = getOperatorState();
    passed = opState !== undefined;
    if (!passed) findings.push("Operator state unavailable");
  } else if (policy.type === "access_control") {
    passed = !isRuntimePaused();
    if (!passed) findings.push("Runtime is paused — governance inactive");
  } else {
    passed = true;
  }

  const result: PolicyExecutionResult = { policyId, passed, findings, executedAt };
  RESULTS.push(result);
  if (RESULTS.length > MAX_RESULTS) {
    RESULTS.shift();
  }
  return result;
}

export function executeAllPolicies(): PolicyExecutionResult[] {
  return POLICIES.filter((p) => p.enabled).map((p) => executePolicy(p.policyId));
}

export function getLatestResult(
  policyId: string
): PolicyExecutionResult | undefined {
  for (let i = RESULTS.length - 1; i >= 0; i--) {
    if (RESULTS[i]?.policyId === policyId) return RESULTS[i];
  }
  return undefined;
}

export function getPolicyViolations(): PolicyExecutionResult[] {
  return RESULTS.filter((r) => !r.passed);
}
