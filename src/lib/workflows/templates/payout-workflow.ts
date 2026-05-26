import { defineWorkflow, type WorkflowDefinition } from "../dsl";

export const PAYOUT_RELEASE_WORKFLOW: WorkflowDefinition = defineWorkflow({
  id: "payout-release-v1",
  name: "Payout Release Workflow",
  version: "1.0.0",
  description:
    "FINN risk check, policy/dispute/compliance gates, auto-release or finance review.",
  trigger: { event: "payout_queued" },
  steps: [
    {
      id: "risk_check",
      name: "FINN Payout Risk Assessment",
      type: "agent_call",
      config: { agent: "FINN", action: "assessPayoutRisk" },
      onSuccess: "policy_check",
      onFailure: "hold_review",
    },
    {
      id: "policy_check",
      name: "Daily Cap Policy Check",
      type: "condition",
      config: { check: "within_daily_cap" },
      onSuccess: "compliance_check",
      onFailure: "hold_review",
    },
    {
      id: "compliance_check",
      name: "No Open Disputes Check",
      type: "condition",
      config: { check: "no_open_disputes" },
      onSuccess: "auto_release",
      onFailure: "hold_review",
    },
    {
      id: "auto_release",
      name: "Auto-Release Payout",
      type: "emit_event",
      config: { event: "payout_released" },
      onSuccess: "notify_provider",
    },
    {
      id: "hold_review",
      name: "Finance Review Required",
      type: "human_approval",
      config: { approverRole: "finance", timeoutHours: 24 },
      onSuccess: "auto_release",
      onFailure: "escalate",
      timeoutMs: 86400000,
    },
    {
      id: "notify_provider",
      name: "Notify Provider",
      type: "notify",
      config: { recipients: ["provider"], template: "payout_released" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["finance", "admin"] },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["finance"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency"],
  tenantConfigurable: true,
});
