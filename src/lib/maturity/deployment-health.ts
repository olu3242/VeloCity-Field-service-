import { isRuntimePaused } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getPendingApprovals } from "@/lib/workflows/hitl";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { DEFAULT_QUOTAS } from "@/lib/scaling/execution-quotas";

export interface DeploymentHealthCheck {
  checkName: string;
  passed: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface DeploymentHealthReport {
  overallStatus: "ready" | "degraded" | "blocked";
  score: number;
  checks: DeploymentHealthCheck[];
  blockers: DeploymentHealthCheck[];
  warnings: DeploymentHealthCheck[];
  generatedAt: string;
}

export function runDeploymentHealthCheck(): DeploymentHealthReport {
  const checks: DeploymentHealthCheck[] = [];

  // 1. governance_active
  const runtimeActive = !isRuntimePaused();
  checks.push({
    checkName: "governance_active",
    passed: runtimeActive,
    message: runtimeActive
      ? "Runtime operational"
      : "Runtime is paused — deployment blocked",
    severity: runtimeActive ? "info" : "critical",
  });

  // 2. circuit_breakers
  const circuits = getAllCircuits();
  const openCount = circuits.filter((c) => c.state === "open").length;
  const circuitsPassed = openCount <= 3;
  checks.push({
    checkName: "circuit_breakers",
    passed: circuitsPassed,
    message: `${openCount} circuit(s) currently open`,
    severity: openCount === 0 ? "info" : openCount <= 3 ? "warning" : "critical",
  });

  // 3. pending_approvals
  const pendingCount = getPendingApprovals().length;
  const approvalsPassed = pendingCount === 0;
  checks.push({
    checkName: "pending_approvals",
    passed: approvalsPassed,
    message: `${pendingCount} pending approval(s) awaiting resolution`,
    severity: approvalsPassed ? "info" : "warning",
  });

  // 4. resilience_score
  const report = getResilienceReport();
  const total = report.passed + report.failed;
  const overallScore = total > 0 ? (report.passed / total) * 100 : 100;
  const resiliencePassed = overallScore >= 70;
  checks.push({
    checkName: "resilience_score",
    passed: resiliencePassed,
    message: `Resilience score: ${Math.round(overallScore)}`,
    severity: resiliencePassed ? "info" : "critical",
  });

  // 5. quota_headroom
  const quotaPresent = DEFAULT_QUOTAS.hourlyEventLimit > 0;
  checks.push({
    checkName: "quota_headroom",
    passed: quotaPresent,
    message: "Quota configuration present",
    severity: "info",
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  const blockers = checks.filter((c) => !c.passed && c.severity === "critical");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  const overallStatus: DeploymentHealthReport["overallStatus"] =
    blockers.length > 0 ? "blocked" : score < 80 ? "degraded" : "ready";

  return {
    overallStatus,
    score,
    checks,
    blockers,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
