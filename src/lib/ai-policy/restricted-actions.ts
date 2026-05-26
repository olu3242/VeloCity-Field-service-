/**
 * Restricted AI action enforcement.
 */

export interface RestrictedAction {
  actionId: string;
  description: string;
  agentName: string;
  maxValueUsd?: number;
  requiresHumanApproval: boolean;
  cooldownMs?: number;
  lastExecutedAt?: string;
}

const RESTRICTED_ACTIONS = new Map<string, RestrictedAction>([
  [
    "payout-large",
    {
      actionId: "payout-large",
      description: "Large payout disbursement",
      agentName: "FINN",
      maxValueUsd: 50_000,
      requiresHumanApproval: true,
      cooldownMs: 300_000,
    },
  ],
  [
    "dispute-bulk-resolve",
    {
      actionId: "dispute-bulk-resolve",
      description: "Bulk dispute resolution",
      agentName: "IVY",
      maxValueUsd: undefined,
      requiresHumanApproval: true,
      cooldownMs: 600_000,
    },
  ],
  [
    "agent-suspend",
    {
      actionId: "agent-suspend",
      description: "Suspend an agent from processing",
      agentName: "MAX",
      maxValueUsd: undefined,
      requiresHumanApproval: true,
      cooldownMs: 3_600_000,
    },
  ],
]);

export function registerRestrictedAction(action: RestrictedAction): void {
  RESTRICTED_ACTIONS.set(action.actionId, action);
}

export function checkActionAllowed(
  actionId: string,
  context: { valueUsd?: number; requestedBy?: string }
): { allowed: boolean; reason?: string } {
  const action = RESTRICTED_ACTIONS.get(actionId);
  if (action === undefined) return { allowed: true };

  if (action.requiresHumanApproval) {
    return { allowed: false, reason: "Human approval required" };
  }

  if (action.cooldownMs !== undefined && action.lastExecutedAt !== undefined) {
    const elapsed = Date.now() - new Date(action.lastExecutedAt).getTime();
    if (elapsed < action.cooldownMs) {
      return { allowed: false, reason: "Action is on cooldown" };
    }
  }

  if (
    action.maxValueUsd !== undefined &&
    context.valueUsd !== undefined &&
    context.valueUsd > action.maxValueUsd
  ) {
    return {
      allowed: false,
      reason: `Value ${context.valueUsd} exceeds maximum allowed ${action.maxValueUsd}`,
    };
  }

  return { allowed: true };
}

export function recordExecution(actionId: string): void {
  const action = RESTRICTED_ACTIONS.get(actionId);
  if (action === undefined) return;
  action.lastExecutedAt = new Date().toISOString();
  RESTRICTED_ACTIONS.set(actionId, action);
}

export function getAllRestrictedActions(): RestrictedAction[] {
  return Array.from(RESTRICTED_ACTIONS.values());
}
