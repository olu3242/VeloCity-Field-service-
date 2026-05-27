import { defineWorkflow, type WorkflowDefinition } from "../dsl";

export const DISPUTE_RESOLUTION_WORKFLOW: WorkflowDefinition = defineWorkflow({
  id: "dispute-resolution-v1",
  name: "Dispute Resolution Workflow",
  version: "1.0.0",
  description:
    "Automated dispute intake, IVY analysis, auto-resolve or human review, and party notification.",
  trigger: { event: "dispute_opened" },
  steps: [
    {
      id: "intake",
      name: "IVY Dispute Analysis",
      type: "agent_call",
      config: { agent: "IVY", action: "analyzeDispute" },
      onSuccess: "evidence_check",
      onFailure: "human_review",
    },
    {
      id: "evidence_check",
      name: "Evidence Strength Check",
      type: "condition",
      config: { check: "ivy_confidence >= 0.8" },
      onSuccess: "auto_resolve",
      onFailure: "human_review",
    },
    {
      id: "auto_resolve",
      name: "Auto-Resolve Dispute",
      type: "emit_event",
      config: { event: "dispute_resolved", useIvyRecommendation: true },
      onSuccess: "payout_hold_check",
      onFailure: "human_review",
    },
    {
      id: "human_review",
      name: "Admin Review Required",
      type: "human_approval",
      config: { approverRole: "admin", timeoutHours: 48 },
      onSuccess: "apply_resolution",
      onFailure: "escalate",
      timeoutMs: 172800000,
    },
    {
      id: "apply_resolution",
      name: "Apply Resolution Decision",
      type: "emit_event",
      config: { event: "dispute_resolved" },
      onSuccess: "notify_parties",
    },
    {
      id: "notify_parties",
      name: "Notify Customer and Provider",
      type: "notify",
      config: { recipients: ["customer", "provider"], template: "dispute_resolved" },
      onSuccess: "payout_hold_check",
    },
    {
      id: "payout_hold_check",
      name: "Check Payout Hold",
      type: "emit_event",
      config: { event: "payout_hold", conditional: "refund_approved" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "approval_denied", action: "pause_workflow" },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin", "operations"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency", "alert_on_escalation"],
  tenantConfigurable: true,
});
