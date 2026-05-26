export type WorkflowStepType =
  | "agent_call"
  | "emit_event"
  | "human_approval"
  | "condition"
  | "notify"
  | "wait";

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number;
  retries?: number;
}

export type EscalationCondition =
  | "step_failed"
  | "timeout"
  | "approval_denied"
  | "agent_failed";

export type EscalationAction =
  | "notify_admin"
  | "pause_workflow"
  | "retry"
  | "abort";

export interface EscalationRule {
  condition: EscalationCondition;
  action: EscalationAction;
  notifyRoles?: string[];
}

export interface WorkflowTrigger {
  event: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  escalationRules: EscalationRule[];
  humanInTheLoop: boolean;
  observabilityHooks: string[];
  tenantConfigurable: boolean;
}

export function defineWorkflow(def: WorkflowDefinition): WorkflowDefinition {
  return def;
}

export function validateWorkflow(def: WorkflowDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!def.id) errors.push("Workflow id is required");
  if (!def.name) errors.push("Workflow name is required");
  if (!def.version) errors.push("Workflow version is required");
  if (!def.trigger.event) errors.push("Workflow trigger.event is required");

  const validStepIds = new Set(def.steps.map((s) => s.id));
  const allowedTerminals = new Set(["escalate", "abort", "end"]);

  for (const step of def.steps) {
    if (step.onSuccess && !validStepIds.has(step.onSuccess) && !allowedTerminals.has(step.onSuccess)) {
      errors.push(
        `Step "${step.id}" onSuccess references unknown step id "${step.onSuccess}"`
      );
    }
    if (step.onFailure && !validStepIds.has(step.onFailure) && !allowedTerminals.has(step.onFailure)) {
      errors.push(
        `Step "${step.id}" onFailure references unknown step id "${step.onFailure}"`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
