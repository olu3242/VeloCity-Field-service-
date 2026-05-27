/**
 * Automation Policies — defines what the governance layer allows, throttles, or blocks.
 * All in-memory; no DB calls. Designed for fast synchronous evaluation.
 */

export interface PolicyRule {
  type: "rate_limit" | "require_approval" | "block" | "throttle" | "notify_admin";
  config: Record<string, unknown>;
}

export interface AutomationPolicy {
  id: string;
  name: string;
  scope: "global" | "tenant" | "agent" | "event_type";
  enabled: boolean;
  rules: PolicyRule[];
}

export const DEFAULT_POLICIES: AutomationPolicy[] = [
  {
    id: "dispute-auto-resolution",
    name: "Dispute Auto-Resolution Rate Limit",
    scope: "tenant",
    enabled: true,
    rules: [
      {
        type: "rate_limit",
        config: { maxCount: 5, windowMs: 3_600_000, unit: "per_tenant_per_hour" },
      },
    ],
  },
  {
    id: "payout-auto-release",
    name: "Payout Auto-Release Daily Cap",
    scope: "tenant",
    enabled: true,
    rules: [
      {
        type: "rate_limit",
        config: { maxAmountUsd: 50_000, windowMs: 86_400_000, unit: "per_tenant_per_day" },
      },
    ],
  },
  {
    id: "provider-suspension",
    name: "Provider Suspension Requires Approval",
    scope: "event_type",
    enabled: true,
    rules: [
      {
        type: "require_approval",
        config: { eventTypes: ["provider_suspension"], approverRole: "admin" },
      },
    ],
  },
  {
    id: "fraud-escalation",
    name: "Fraud Escalation Auto-Block",
    scope: "global",
    enabled: true,
    rules: [
      { type: "block", config: { immediate: true } },
      { type: "notify_admin", config: { channel: "ops-alerts", priority: "high" } },
    ],
  },
  {
    id: "retry-limits",
    name: "Retry Limits with Exponential Backoff",
    scope: "global",
    enabled: true,
    rules: [
      {
        type: "throttle",
        config: { maxRetries: 3, backoffBase: 2, backoffUnit: "minutes" },
      },
    ],
  },
  {
    id: "ai-execution-rate",
    name: "AI Execution Rate Limit",
    scope: "tenant",
    enabled: true,
    rules: [
      {
        type: "rate_limit",
        config: { maxCount: 100, windowMs: 60_000, unit: "per_tenant_per_minute" },
      },
    ],
  },
];

const EVENT_TYPE_POLICY_MAP: Record<string, string[]> = {
  dispute_resolved: ["dispute-auto-resolution"],
  payout_released: ["payout-auto-release"],
  provider_suspension: ["provider-suspension"],
  fraud_escalation: ["fraud-escalation"],
};

export function getPoliciesForEvent(eventType: string): AutomationPolicy[] {
  const ids = EVENT_TYPE_POLICY_MAP[eventType] ?? [];
  return DEFAULT_POLICIES.filter((p) => ids.includes(p.id) && p.enabled);
}

export function isPolicyEnabled(policyId: string): boolean {
  return DEFAULT_POLICIES.some((p) => p.id === policyId && p.enabled);
}
