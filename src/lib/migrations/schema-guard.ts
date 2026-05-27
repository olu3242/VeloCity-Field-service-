/**
 * Schema Guard — validates pre-migration safety checks.
 * safeToMigrate = no critical failures.
 */

import { getOperatorState, isRuntimePaused } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export interface SchemaCheck {
  checkId: string;
  name: string;
  passed: boolean;
  detail: string;
  criticalChange: boolean;
}

export interface SchemaGuardReport {
  checks: SchemaCheck[];
  passed: number;
  failed: number;
  criticalFailures: SchemaCheck[];
  safeToMigrate: boolean;
  generatedAt: string;
}

export function runSchemaGuard(): SchemaGuardReport {
  const checks: SchemaCheck[] = [];

  // Check 1: agents-present (non-critical)
  const agentCount = Object.keys(AGENT_REGISTRY).length;
  checks.push({
    checkId: "agents-present",
    name: "Agents Present",
    passed: agentCount >= 5,
    detail: `${agentCount} agents registered (minimum 5 required)`,
    criticalChange: false,
  });

  // Check 2: governance-active (critical)
  const opState = getOperatorState();
  const govActive = opState !== null && opState !== undefined;
  checks.push({
    checkId: "governance-active",
    name: "Governance Active",
    passed: govActive,
    detail: govActive
      ? "Operator state is accessible"
      : "Operator state unavailable",
    criticalChange: true,
  });

  // Check 3: no-open-circuits (non-critical)
  const openCount = getAllCircuits().filter((c) => c.state === "open").length;
  checks.push({
    checkId: "no-open-circuits",
    name: "No Open Circuits",
    passed: openCount <= 3,
    detail: `${openCount} open circuit(s) detected (threshold: 3)`,
    criticalChange: false,
  });

  // Check 4: runtime-not-paused (critical)
  const notPaused = !isRuntimePaused();
  checks.push({
    checkId: "runtime-not-paused",
    name: "Runtime Not Paused",
    passed: notPaused,
    detail: notPaused ? "Runtime is active" : "Runtime is currently paused",
    criticalChange: true,
  });

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const criticalFailures = checks.filter(
    (c) => c.criticalChange && !c.passed
  );

  return {
    checks,
    passed,
    failed,
    criticalFailures,
    safeToMigrate: criticalFailures.length === 0,
    generatedAt: new Date().toISOString(),
  };
}
