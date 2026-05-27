import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runComplianceValidation } from "@/lib/maturity/compliance-validator";
import { runDeploymentHealthCheck } from "@/lib/maturity/deployment-health";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { monitorIntegrations } from "@/lib/integrations/integration-health";

export interface TopologyCheck {
  checkId: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface TopologyReport {
  checks: TopologyCheck[];
  passed: number;
  failed: number;
  topologyValid: boolean;
  generatedAt: string;
}

export function validateTopology(): TopologyReport {
  const checks: TopologyCheck[] = [];

  const agentCount = Object.keys(AGENT_REGISTRY).length;
  checks.push({
    checkId: "agents-registered",
    name: "Agents Registered",
    passed: agentCount >= 5,
    detail: `${agentCount} agent(s) registered (minimum 5 required)`,
  });

  const compliance = runComplianceValidation();
  checks.push({
    checkId: "compliance-validates",
    name: "Compliance Validates",
    passed: compliance.overallCompliant,
    detail: `Compliance score: ${compliance.score} — ${compliance.overallCompliant ? "compliant" : "non-compliant"}`,
  });

  const health = runDeploymentHealthCheck();
  checks.push({
    checkId: "deployment-health",
    name: "Deployment Health",
    passed: health.overallStatus !== "blocked",
    detail: `Deployment status: ${health.overallStatus}`,
  });

  const effectiveness = calculateEffectiveness();
  checks.push({
    checkId: "effectiveness-measured",
    name: "Effectiveness Measured",
    passed: effectiveness.composite > 0,
    detail: `Composite effectiveness: ${Math.round(effectiveness.composite)}`,
  });

  const integrations = monitorIntegrations();
  checks.push({
    checkId: "integrations-monitored",
    name: "Integrations Monitored",
    passed: integrations.adapters.length > 0,
    detail: `${integrations.adapters.length} adapter(s) monitored`,
  });

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;

  return {
    checks,
    passed,
    failed,
    topologyValid: failed === 0,
    generatedAt: new Date().toISOString(),
  };
}
