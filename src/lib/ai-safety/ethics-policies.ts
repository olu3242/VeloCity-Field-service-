/**
 * Ethics Policies — pre-registered governance rules for agent actions.
 */

export interface EthicsPolicy {
  policyId: string;
  name: string;
  rule: string;
  scope: "all" | "financial" | "dispute";
  action: "warn" | "block" | "require_human";
  active: boolean;
}

const POLICIES: Map<string, EthicsPolicy> = new Map([
  [
    "no-bulk-financial-override",
    {
      policyId: "no-bulk-financial-override",
      name: "No Bulk Financial Override",
      rule: "No bulk financial actions without explicit approval",
      scope: "financial",
      action: "block",
      active: true,
    },
  ],
  [
    "dispute-fairness",
    {
      policyId: "dispute-fairness",
      name: "Dispute Fairness",
      rule: "Flag low-confidence dispute decisions for review",
      scope: "dispute",
      action: "warn",
      active: true,
    },
  ],
  [
    "no-silent-data-deletion",
    {
      policyId: "no-silent-data-deletion",
      name: "No Silent Data Deletion",
      rule: "Data deletion requires explicit audit trail",
      scope: "all",
      action: "block",
      active: true,
    },
  ],
]);

interface EthicsEvaluation {
  allowed: boolean;
  policy?: EthicsPolicy;
  reason: string;
}

export function evaluateEthics(
  agentName: string,
  action: string,
  scope: EthicsPolicy["scope"]
): EthicsEvaluation {
  const matchingPolicies = Array.from(POLICIES.values()).filter(
    (p) => p.active && (p.scope === "all" || p.scope === scope)
  );

  for (const policy of matchingPolicies) {
    if (policy.action === "block") {
      return {
        allowed: false,
        policy,
        reason: `Blocked by policy "${policy.name}": ${policy.rule}`,
      };
    }

    if (policy.action === "warn" || policy.action === "require_human") {
      return {
        allowed: true,
        policy,
        reason: `Policy "${policy.name}" triggered for agent ${agentName} performing ${action}`,
      };
    }
  }

  return { allowed: true, reason: `No active policies restrict scope "${scope}"` };
}

export function getActivePolicies(): EthicsPolicy[] {
  return Array.from(POLICIES.values()).filter((p) => p.active);
}

export function registerPolicy(policy: EthicsPolicy): void {
  POLICIES.set(policy.policyId, policy);
}
