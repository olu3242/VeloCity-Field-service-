import type { AgentName } from "@/lib/contracts/agents";
import { AGENT_REGISTRY, type AgentRegistration } from "@/lib/agents/registry";

export type CapabilityStatus = "available" | "degraded" | "unavailable";

export interface RuntimeCapability {
  agentId: string;
  agentName: AgentName;
  capabilityType: AgentRegistration["capability_type"];
  supportedEventTypes: string[];
  status: CapabilityStatus;
  executionLimits: { max_tokens: number; timeout_ms: number };
  lastHealthCheck: string;
}

const statusOverrides = new Map<AgentName, CapabilityStatus>();

export function discoverCapabilities(): RuntimeCapability[] {
  return Object.values(AGENT_REGISTRY)
    .filter((reg) => reg.status === "active")
    .map((reg): RuntimeCapability => ({
      agentId: reg.agent_id,
      agentName: reg.name,
      capabilityType: reg.capability_type,
      supportedEventTypes: reg.supported_events,
      status: statusOverrides.get(reg.name) ?? "available",
      executionLimits: {
        max_tokens: reg.execution_limits.max_tokens,
        timeout_ms: reg.execution_limits.timeout_ms,
      },
      lastHealthCheck: new Date().toISOString(),
    }));
}

export function findCapableAgent(eventType: string): RuntimeCapability | null {
  return (
    discoverCapabilities().find(
      (cap) => cap.supportedEventTypes.includes(eventType) && cap.status === "available"
    ) ?? null
  );
}

export function findAllCapableAgents(eventType: string): RuntimeCapability[] {
  return discoverCapabilities().filter(
    (cap) => cap.supportedEventTypes.includes(eventType) && cap.status === "available"
  );
}

export function getCapabilityStatus(agentName: AgentName): RuntimeCapability | null {
  const reg = AGENT_REGISTRY[agentName];
  if (!reg || reg.status !== "active") return null;

  return {
    agentId: reg.agent_id,
    agentName: reg.name,
    capabilityType: reg.capability_type,
    supportedEventTypes: reg.supported_events,
    status: statusOverrides.get(agentName) ?? "available",
    executionLimits: {
      max_tokens: reg.execution_limits.max_tokens,
      timeout_ms: reg.execution_limits.timeout_ms,
    },
    lastHealthCheck: new Date().toISOString(),
  };
}

export function markCapabilityDegraded(agentName: AgentName, reason: string): void {
  statusOverrides.set(agentName, "degraded");
  console.warn(`[capability-discovery] Agent ${agentName} marked degraded: ${reason}`);
}
