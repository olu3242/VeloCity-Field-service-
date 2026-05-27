import { getOperatorState } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { checkAllSafety } from "@/lib/governance/safety";
import { getPendingApprovals } from "@/lib/workflows/hitl";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export interface ArchitectureCheck {
  checkId: string;
  name: string;
  category:
    | "event_fabric"
    | "agent_registry"
    | "governance"
    | "observability"
    | "isolation";
  passed: boolean;
  detail: string;
  critical: boolean;
}

export interface ArchitectureReport {
  passed: number;
  failed: number;
  criticalFailures: ArchitectureCheck[];
  allChecks: ArchitectureCheck[];
  compliant: boolean;
  generatedAt: string;
}

function runChecks(): ArchitectureCheck[] {
  const checks: ArchitectureCheck[] = [];

  const agentCount = Object.keys(AGENT_REGISTRY).length;
  checks.push({
    checkId: "agent-registry-populated",
    name: "Agent Registry Populated",
    category: "agent_registry",
    passed: agentCount > 0,
    detail: `${agentCount} agent(s) registered`,
    critical: true,
  });

  const opState = getOperatorState();
  checks.push({
    checkId: "governance-reachable",
    name: "Governance Reachable",
    category: "governance",
    passed: opState !== undefined,
    detail: opState !== undefined ? "Operator state accessible" : "Operator state unreachable",
    critical: true,
  });

  const circuits = getAllCircuits();
  checks.push({
    checkId: "circuit-breakers-present",
    name: "Circuit Breakers Present",
    category: "governance",
    passed: circuits.length > 0,
    detail: `${circuits.length} circuit(s) registered`,
    critical: true,
  });

  let hitlAvailable = true;
  try {
    getPendingApprovals();
  } catch {
    hitlAvailable = false;
  }
  checks.push({
    checkId: "hitl-available",
    name: "HITL Available",
    category: "observability",
    passed: hitlAvailable,
    detail: hitlAvailable ? "HITL approval system reachable" : "HITL system threw on call",
    critical: false,
  });

  checks.push({
    checkId: "safety-checks-present",
    name: "Safety Checks Present",
    category: "governance",
    passed: typeof checkAllSafety === "function",
    detail: typeof checkAllSafety === "function" ? "checkAllSafety function available" : "checkAllSafety not found",
    critical: false,
  });

  const report = getResilienceReport();
  checks.push({
    checkId: "resilience-tested",
    name: "Resilience Tested",
    category: "observability",
    passed: report.results.length > 0,
    detail: `${report.results.length} resilience test(s) run`,
    critical: false,
  });

  return checks;
}

export function validateArchitecture(): ArchitectureReport {
  const allChecks = runChecks();
  const passed = allChecks.filter((c) => c.passed).length;
  const failed = allChecks.filter((c) => !c.passed).length;
  const criticalFailures = allChecks.filter((c) => !c.passed && c.critical);
  const compliant = criticalFailures.length === 0;

  return {
    passed,
    failed,
    criticalFailures,
    allChecks,
    compliant,
    generatedAt: new Date().toISOString(),
  };
}
