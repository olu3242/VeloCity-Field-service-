import { defineWorkflow, type WorkflowDefinition } from "../dsl";

export const FRAUD_INVESTIGATION_WORKFLOW: WorkflowDefinition = defineWorkflow({
  id: "fraud-investigation-v1",
  name: "Fraud Investigation Workflow",
  version: "1.0.0",
  description:
    "GABRIEL fraud scoring, immediate block, admin investigation, restore or escalate.",
  trigger: { event: "payment_failed", condition: "fraud_signal_detected" },
  steps: [
    {
      id: "signal_intake",
      name: "GABRIEL Fraud Score",
      type: "agent_call",
      config: { agent: "GABRIEL", action: "scoreFraudSignal" },
      onSuccess: "immediate_block",
      onFailure: "notify_admin",
    },
    {
      id: "immediate_block",
      name: "Block Account Immediately",
      type: "emit_event",
      config: { event: "agent_run", action: "block_account" },
      onSuccess: "notify_admin",
    },
    {
      id: "notify_admin",
      name: "Alert Operations Team",
      type: "notify",
      config: {
        recipients: ["admin", "operations"],
        template: "fraud_alert",
        priority: "critical",
      },
      onSuccess: "investigation",
    },
    {
      id: "investigation",
      name: "Admin Investigation Review",
      type: "human_approval",
      config: { approverRole: "admin", timeoutHours: 24 },
      onSuccess: "resolution",
      onFailure: "escalate",
      timeoutMs: 86400000,
    },
    {
      id: "resolution",
      name: "Fraud vs False Positive Check",
      type: "condition",
      config: { check: "investigation_confirmed_fraud" },
      onSuccess: "escalate_fraud",
      onFailure: "restore_account",
    },
    {
      id: "escalate_fraud",
      name: "Escalate Confirmed Fraud",
      type: "emit_event",
      config: { event: "dispute_opened", reason: "confirmed_fraud" },
      onSuccess: "end",
    },
    {
      id: "restore_account",
      name: "Restore Account (False Positive)",
      type: "emit_event",
      config: { event: "agent_run", action: "restore_account" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin", "operations"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency", "alert_on_escalation"],
  tenantConfigurable: false,
});
