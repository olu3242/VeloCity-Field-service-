/**
 * Runtime compatibility checks for safe evolution.
 * Validates that platform invariants hold before allowing migrations.
 */

import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { getOperatorState } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { getEffectiveAction } from "@/lib/ai-policy/execution-rules";

export interface CompatibilityCheck {
  checkId: string;
  checkName: string;
  category: "event_types" | "agent_contract" | "governance" | "data_schema" | "api_contract";
  passed: boolean;
  detail: string;
  breakingChange: boolean;
}

export interface CompatibilityReport {
  checks: CompatibilityCheck[];
  passed: number;
  failed: number;
  breakingChanges: CompatibilityCheck[];
  safeToMigrate: boolean;
  generatedAt: string;
}

export async function runCompatibilityChecks(): Promise<CompatibilityReport> {
  const checks: CompatibilityCheck[] = [];

  // 1. agent-registry-stable: >= 5 agents registered
  const agentCount = Object.keys(AGENT_REGISTRY).length;
  checks.push({
    checkId: "agent-registry-stable",
    checkName: "Agent Registry Stability",
    category: "agent_contract",
    passed: agentCount >= 5,
    detail: `${agentCount} agent(s) registered in AGENT_REGISTRY (minimum 5).`,
    breakingChange: false,
  });

  // 2. governance-intact: operator state readable
  const opState = getOperatorState();
  const governanceOk = opState !== undefined && typeof opState.runtimePaused === "boolean";
  checks.push({
    checkId: "governance-intact",
    checkName: "Governance Layer Intact",
    category: "governance",
    passed: governanceOk,
    detail: governanceOk
      ? "Operator state is accessible and well-typed."
      : "Operator state could not be read — governance may be broken.",
    breakingChange: true,
  });

  // 3. circuits-healthy: no more than 2 open circuits
  const openCircuits = getAllCircuits().filter((c) => c.state === "open").length;
  checks.push({
    checkId: "circuits-healthy",
    checkName: "Circuit Breaker Health",
    category: "governance",
    passed: openCircuits <= 2,
    detail: `${openCircuits} open circuit(s) detected (threshold: 2).`,
    breakingChange: false,
  });

  // 4. effectiveness-baseline: composite effectiveness >= 50
  const effectiveness = calculateEffectiveness();
  const effectivenessOk = effectiveness.composite >= 50;
  checks.push({
    checkId: "effectiveness-baseline",
    checkName: "Effectiveness Baseline",
    category: "api_contract",
    passed: effectivenessOk,
    detail: `Composite effectiveness: ${effectiveness.composite.toFixed(1)} (minimum 50 required).`,
    breakingChange: true,
  });

  // 5. ai-policy-active: IVY/dispute_opened not denied
  const policyAction = await getEffectiveAction("IVY", "dispute_opened", {});
  const policyOk = policyAction !== "deny";
  checks.push({
    checkId: "ai-policy-active",
    checkName: "AI Policy Active",
    category: "event_types",
    passed: policyOk,
    detail: `Effective action for IVY/dispute_opened: "${policyAction}".`,
    breakingChange: false,
  });

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const breakingChanges = checks.filter((c) => !c.passed && c.breakingChange);

  return {
    checks,
    passed,
    failed,
    breakingChanges,
    safeToMigrate: breakingChanges.length === 0,
    generatedAt: new Date().toISOString(),
  };
}
