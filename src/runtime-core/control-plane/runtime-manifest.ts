import { AGENT_REGISTRY } from "@/lib/agents/registry"

export interface PlatformManifest {
  platformName: string
  version: string
  buildId: string
  generatedAt: string
  agents: string[]
  subsystems: string[]
  eventTypes: string[]
  regions: string[]
  capabilities: string[]
}

const CANONICAL_EVENT_TYPES = [
  "payment_failed", "payment_succeeded", "payout_released", "payout_failed",
  "dispute_opened", "dispute_resolved", "dispute_escalated",
  "job_assigned", "job_completed", "job_cancelled",
  "sla_breach", "sla_escalate", "sla_warn",
  "agent_run", "agent_failed",
  "compliance_violation", "compliance_review_required",
  "runtime_paused", "runtime_resumed",
  "circuit_opened", "circuit_closed",
  "trust_updated", "reputation_changed",
  "federation_sync", "federation_breach",
]

const SUBSYSTEM_IDS = [
  "governance", "ai-dispatch", "automation-queue", "circuit-breakers",
  "tenant-isolation", "sla-engine", "telemetry", "certification",
  "federation", "treasury", "runtime-resilience", "ops-telemetry",
]

const CAPABILITY_LIST = [
  "ai-dispute-resolution", "automated-payment-recovery", "sla-monitoring",
  "tenant-isolation", "circuit-breaking", "predictive-scaling",
  "distributed-queue-fabric", "enterprise-certification",
  "federated-orchestration", "autonomous-remediation",
  "runtime-observability", "financial-intelligence",
]

export function generateManifest(): PlatformManifest {
  return {
    platformName: "VeloCity Enterprise Runtime",
    version: "1.0.0",
    buildId: "velocity-prod",
    generatedAt: new Date().toISOString(),
    agents: Object.keys(AGENT_REGISTRY),
    subsystems: SUBSYSTEM_IDS,
    eventTypes: CANONICAL_EVENT_TYPES,
    regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
    capabilities: CAPABILITY_LIST,
  }
}

export function getAgentCount(): number {
  return Object.keys(AGENT_REGISTRY).length
}

export function isKnownEventType(eventType: string): boolean {
  return CANONICAL_EVENT_TYPES.includes(eventType)
}

export function isKnownSubsystem(subsystemId: string): boolean {
  return SUBSYSTEM_IDS.includes(subsystemId)
}
