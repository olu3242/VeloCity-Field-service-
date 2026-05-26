/**
 * AI execution rules registry.
 */

export type RuleAction = "allow" | "deny" | "require_approval" | "log_only";

export interface AIExecutionRule {
  ruleId: string;
  name: string;
  agentName?: string;
  eventType?: string;
  condition: string;
  action: RuleAction;
  priority: number;
  enabled: boolean;
}

export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  action: RuleAction;
  reason: string;
}

const RULES: AIExecutionRule[] = [
  {
    ruleId: "no-dispatch-paused",
    name: "Block dispatch when runtime paused",
    agentName: undefined,
    eventType: undefined,
    condition: "isRuntimePaused()",
    action: "deny",
    priority: 100,
    enabled: true,
  },
  {
    ruleId: "no-payout-without-approval",
    name: "Payout requires approval",
    agentName: "FINN",
    eventType: "payout_released",
    condition: "amount > 50000",
    action: "require_approval",
    priority: 90,
    enabled: true,
  },
  {
    ruleId: "gabriel-anomaly-log",
    name: "Log all GABRIEL anomaly calls",
    agentName: "GABRIEL",
    eventType: undefined,
    condition: "always",
    action: "log_only",
    priority: 10,
    enabled: true,
  },
  {
    ruleId: "allow-standard",
    name: "Allow standard execution",
    agentName: undefined,
    eventType: undefined,
    condition: "default fallback",
    action: "allow",
    priority: 0,
    enabled: true,
  },
];

export function registerRule(rule: AIExecutionRule): void {
  RULES.push(rule);
  RULES.sort((a, b) => b.priority - a.priority);
}

export async function evaluateRules(
  agentName: string,
  eventType: string,
  context: Record<string, unknown>
): Promise<RuleEvaluation[]> {
  void context;
  const { isRuntimePaused } = await import(
    "../governance/operator"
  );

  const evaluations: RuleEvaluation[] = [];

  for (const rule of RULES) {
    if (!rule.enabled) continue;
    const agentMatch =
      rule.agentName === undefined || rule.agentName === agentName;
    const eventMatch =
      rule.eventType === undefined || rule.eventType === eventType;
    if (!agentMatch || !eventMatch) continue;

    let matched = true;
    let reason = rule.condition;

    if (rule.ruleId === "no-dispatch-paused") {
      matched = isRuntimePaused();
      reason = matched ? "Runtime is currently paused" : "Runtime is active";
    }

    evaluations.push({
      ruleId: rule.ruleId,
      ruleName: rule.name,
      matched,
      action: rule.action,
      reason,
    });
  }

  return evaluations;
}

export async function getEffectiveAction(
  agentName: string,
  eventType: string,
  context: Record<string, unknown>
): Promise<RuleAction> {
  const evaluations = await evaluateRules(agentName, eventType, context);
  const effective = evaluations.find(
    (e) => e.matched && e.action !== "log_only"
  );
  return effective?.action ?? "allow";
}

export function getRulesByAgent(agentName: string): AIExecutionRule[] {
  return RULES.filter(
    (r) => r.agentName === undefined || r.agentName === agentName
  );
}
