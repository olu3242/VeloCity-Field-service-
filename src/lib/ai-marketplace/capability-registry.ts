/**
 * Governed AI capability registry.
 * Pre-registers capabilities from AGENT_REGISTRY entries.
 */

import { AGENT_REGISTRY } from "@/lib/agents/registry";

export interface AICapability {
  capabilityId: string;
  name: string;
  agentName: string;
  description: string;
  supportedEventTypes: string[];
  requiredConfidence: number;
  policyGated: boolean;
  version: string;
  status: "available" | "beta" | "deprecated" | "restricted";
  usageCount: number;
}

export const CAPABILITIES: Map<string, AICapability> = new Map<string, AICapability>();

// Pre-register from AGENT_REGISTRY
const AGENT_CAPABILITY_DEFAULTS: Record<string, Pick<AICapability, "name" | "description" | "requiredConfidence" | "policyGated" | "status">> = {
  IVY:     { name: "IVY Dispute Resolution",  description: "AI-driven dispute intake and resolution",          requiredConfidence: 0.80, policyGated: true,  status: "available" },
  FINN:    { name: "FINN Finance Automation",  description: "Payment processing and payout management",         requiredConfidence: 0.85, policyGated: true,  status: "available" },
  GABRIEL: { name: "GABRIEL Governance Audit", description: "Compliance checks and governance enforcement",     requiredConfidence: 0.90, policyGated: true,  status: "available" },
  MAX:     { name: "MAX Smart Dispatch",        description: "AI-powered provider matching and dispatch",       requiredConfidence: 0.75, policyGated: false, status: "available" },
  HERALD:  { name: "HERALD Notifications",     description: "Intelligent notification routing and delivery",   requiredConfidence: 0.70, policyGated: false, status: "beta"      },
  ARIA:    { name: "ARIA Customer Alerts",     description: "Proactive customer communication and alerts",     requiredConfidence: 0.70, policyGated: false, status: "beta"      },
};

for (const [agentKey, defaults] of Object.entries(AGENT_CAPABILITY_DEFAULTS)) {
  const reg = AGENT_REGISTRY[agentKey as keyof typeof AGENT_REGISTRY];
  const supportedEventTypes = reg ? reg.supported_events : [];
  const capabilityId = `${agentKey.toLowerCase()}-${defaults.status === "beta" ? "beta" : "core"}`;
  CAPABILITIES.set(capabilityId, {
    capabilityId,
    agentName: agentKey,
    supportedEventTypes,
    version: "1.0.0",
    usageCount: 0,
    ...defaults,
  });
}

// Also register well-known named IDs used by orchestration templates
CAPABILITIES.set("gabriel-audit", {
  capabilityId: "gabriel-audit",
  name: "GABRIEL Compliance Audit",
  agentName: "GABRIEL",
  description: "Full compliance audit for dispute workflows",
  supportedEventTypes: AGENT_REGISTRY.GABRIEL.supported_events,
  requiredConfidence: 0.90,
  policyGated: true,
  version: "1.0.0",
  status: "available",
  usageCount: 0,
});

CAPABILITIES.set("ivy-resolve", {
  capabilityId: "ivy-resolve",
  name: "IVY Dispute Resolution",
  agentName: "IVY",
  description: "End-to-end dispute resolution capability",
  supportedEventTypes: AGENT_REGISTRY.IVY.supported_events,
  requiredConfidence: 0.80,
  policyGated: true,
  version: "1.0.0",
  status: "available",
  usageCount: 0,
});

CAPABILITIES.set("finn-retry", {
  capabilityId: "finn-retry",
  name: "FINN Payment Retry",
  agentName: "FINN",
  description: "Automated payment failure retry logic",
  supportedEventTypes: AGENT_REGISTRY.FINN.supported_events,
  requiredConfidence: 0.85,
  policyGated: true,
  version: "1.0.0",
  status: "available",
  usageCount: 0,
});

CAPABILITIES.set("aria-notify", {
  capabilityId: "aria-notify",
  name: "ARIA Alert Notification",
  agentName: "ARIA",
  description: "Customer alert notification on payment events",
  supportedEventTypes: [],
  requiredConfidence: 0.70,
  policyGated: false,
  version: "1.0.0",
  status: "beta",
  usageCount: 0,
});

export function registerCapability(cap: AICapability): void {
  CAPABILITIES.set(cap.capabilityId, cap);
}

export function getCapability(capabilityId: string): AICapability | undefined {
  return CAPABILITIES.get(capabilityId);
}

export function findCapabilitiesForEvent(eventType: string): AICapability[] {
  return Array.from(CAPABILITIES.values()).filter(
    (c) => c.supportedEventTypes.includes(eventType) && c.status !== "deprecated"
  );
}

export function recordUsage(capabilityId: string): void {
  const cap = CAPABILITIES.get(capabilityId);
  if (cap) {
    cap.usageCount += 1;
  }
}

export function getCapabilityReport(): {
  total: number;
  byStatus: Record<string, number>;
  topUsed: AICapability[];
} {
  const all = Array.from(CAPABILITIES.values());
  const byStatus: Record<string, number> = {};
  for (const cap of all) {
    byStatus[cap.status] = (byStatus[cap.status] ?? 0) + 1;
  }
  const topUsed = Array.from(all)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);
  return { total: all.length, byStatus, topUsed };
}
