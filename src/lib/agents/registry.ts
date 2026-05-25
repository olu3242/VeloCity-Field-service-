/**
 * VeloCity Agent Registry
 *
 * Formal enterprise contract metadata for all 10 AI agents.
 * Single source of truth for capability declarations, execution limits,
 * retry policies, and observability requirements.
 */

import type { AgentName } from "@/lib/contracts/agents";

// ── Registry interface ────────────────────────────────────────────────────

export interface AgentRegistration {
  /** Versioned agent identifier, e.g. "ivy-v1" */
  agent_id: string;
  name: AgentName;
  capability_type:
    | "intake"
    | "dispatch"
    | "quote"
    | "workflow"
    | "quality"
    | "dispute"
    | "finance"
    | "retention"
    | "territory"
    | "governance";
  /** Platform event types this agent handles */
  supported_events: string[];
  /** AgentContext fields required for a meaningful run */
  required_context: string[];
  /** External systems the agent is allowed to call */
  allowed_tools: string[];
  execution_limits: {
    max_tokens: number;
    timeout_ms: number;
    max_retries: number;
  };
  retry_policy: "immediate" | "exponential" | "none";
  audit_requirements: "full" | "standard" | "minimal";
  /** Observability hooks fired around each execution */
  observability_hooks: string[];
  version: string;
  status: "active" | "beta" | "disabled";
}

// ── Registry entries ──────────────────────────────────────────────────────

export const AGENT_REGISTRY: Record<AgentName, AgentRegistration> = {
  ALICE: {
    agent_id: "alice-v1",
    name: "ALICE",
    capability_type: "intake",
    supported_events: ["job.created", "job.reclassify_requested"],
    required_context: ["tenantId"],
    allowed_tools: ["anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 15_000, max_retries: 2 },
    retry_policy: "exponential",
    audit_requirements: "standard",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure"],
    version: "1.0.0",
    status: "active",
  },

  MAX: {
    agent_id: "max-v1",
    name: "MAX",
    capability_type: "dispatch",
    supported_events: ["job.dispatch_requested", "job.provider_unassigned"],
    required_context: ["tenantId", "jobId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 20_000, max_retries: 3 },
    retry_policy: "exponential",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure", "track_dispatch_match"],
    version: "1.0.0",
    status: "active",
  },

  QUINN: {
    agent_id: "quinn-v1",
    name: "QUINN",
    capability_type: "quote",
    supported_events: ["quote.created", "quote.review_requested", "job.quote_disputed"],
    required_context: ["tenantId", "jobId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 15_000, max_retries: 2 },
    retry_policy: "exponential",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure"],
    version: "1.0.0",
    status: "active",
  },

  NOVA: {
    agent_id: "nova-v1",
    name: "NOVA",
    capability_type: "workflow",
    supported_events: [
      "job.status_change_requested",
      "job.provider_arrived",
      "job.completed",
      "job.cancelled",
    ],
    required_context: ["tenantId", "jobId"],
    allowed_tools: ["supabase_read", "supabase_write", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 20_000, max_retries: 2 },
    retry_policy: "exponential",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure", "track_workflow_transition"],
    version: "1.0.0",
    status: "active",
  },

  REX: {
    agent_id: "rex-v1",
    name: "REX",
    capability_type: "quality",
    supported_events: ["review.submitted", "provider.trust_score_requested", "job.completed"],
    required_context: ["tenantId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 15_000, max_retries: 2 },
    retry_policy: "immediate",
    audit_requirements: "standard",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure"],
    version: "1.0.0",
    status: "active",
  },

  IVY: {
    agent_id: "ivy-v1",
    name: "IVY",
    capability_type: "dispute",
    supported_events: ["dispute.opened", "dispute.evidence_submitted", "dispute.escalated"],
    required_context: ["tenantId", "disputeId"],
    allowed_tools: ["supabase_read", "stripe_read", "anthropic_inference"],
    execution_limits: { max_tokens: 4096, timeout_ms: 30_000, max_retries: 1 },
    retry_policy: "none",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure", "notify_compliance"],
    version: "1.0.0",
    status: "active",
  },

  FINN: {
    agent_id: "finn-v1",
    name: "FINN",
    capability_type: "finance",
    supported_events: [
      "payment.payout_requested",
      "payment.failed",
      "payment.refund_requested",
      "job.completed",
    ],
    required_context: ["tenantId", "jobId"],
    allowed_tools: ["supabase_read", "stripe_read", "stripe_write", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 20_000, max_retries: 2 },
    retry_policy: "exponential",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure", "notify_compliance"],
    version: "1.0.0",
    status: "active",
  },

  LENA: {
    agent_id: "lena-v1",
    name: "LENA",
    capability_type: "retention",
    supported_events: ["job.completed", "customer.churn_risk_detected", "review.submitted"],
    required_context: ["tenantId", "userId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 15_000, max_retries: 2 },
    retry_policy: "exponential",
    audit_requirements: "standard",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure"],
    version: "1.0.0",
    status: "active",
  },

  TESS: {
    agent_id: "tess-v1",
    name: "TESS",
    capability_type: "territory",
    supported_events: [
      "territory.analysis_requested",
      "provider.supply_check",
      "demand.surge_detected",
    ],
    required_context: ["tenantId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 2048, timeout_ms: 20_000, max_retries: 2 },
    retry_policy: "immediate",
    audit_requirements: "minimal",
    observability_hooks: ["log_tokens", "trace_latency"],
    version: "1.0.0",
    status: "active",
  },

  GABRIEL: {
    agent_id: "gabriel-v1",
    name: "GABRIEL",
    capability_type: "governance",
    supported_events: [
      "audit.compliance_check_requested",
      "provider.onboarding_review",
      "dispute.escalated",
      "payment.anomaly_detected",
    ],
    required_context: ["tenantId"],
    allowed_tools: ["supabase_read", "anthropic_inference"],
    execution_limits: { max_tokens: 4096, timeout_ms: 30_000, max_retries: 1 },
    retry_policy: "none",
    audit_requirements: "full",
    observability_hooks: ["log_tokens", "trace_latency", "alert_on_failure", "notify_compliance"],
    version: "1.0.0",
    status: "active",
  },
};

// ── Helper functions ──────────────────────────────────────────────────────

/** Retrieve a single agent registration by name. */
export function getAgent(name: AgentName): AgentRegistration {
  return AGENT_REGISTRY[name];
}

/** Find all agent registrations that handle a given event type. */
export function getAgentsByEvent(eventType: string): AgentRegistration[] {
  return Object.values(AGENT_REGISTRY).filter((reg) =>
    reg.supported_events.includes(eventType)
  );
}

/** Return all registrations whose status is "active". */
export function getActiveAgents(): AgentRegistration[] {
  return Object.values(AGENT_REGISTRY).filter((reg) => reg.status === "active");
}
