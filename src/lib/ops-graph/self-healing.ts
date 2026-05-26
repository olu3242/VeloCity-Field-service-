import { resetCircuit } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused } from "@/lib/governance/operator";

export type HealingActionType =
  | "retry_queue_item"
  | "reset_circuit"
  | "pause_agent"
  | "reroute_workflow"
  | "quarantine_handler"
  | "recover_stuck_workflow";

export interface HealingAction {
  id: string;
  trigger: string;
  action: HealingActionType;
  targetId: string;
  reason: string;
  status: "triggered" | "executing" | "completed" | "failed" | "overridden";
  isReversible: boolean;
  triggeredAt: string;
  completedAt?: string;
  overriddenBy?: string;
}

const HEALING_HISTORY = new Map<string, HealingAction>();

export async function triggerHealing(
  trigger: string,
  action: HealingActionType,
  targetId: string,
  reason: string
): Promise<HealingAction> {
  const id = `heal-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const healingAction: HealingAction = {
    id,
    trigger,
    action,
    targetId,
    reason,
    status: "triggered",
    isReversible: true,
    triggeredAt: new Date().toISOString(),
  };

  HEALING_HISTORY.set(id, healingAction);

  switch (action) {
    case "reset_circuit":
      resetCircuit(targetId);
      healingAction.status = "completed";
      break;

    case "pause_agent":
      console.log(`[SelfHealing] Pausing agent: ${targetId}`);
      healingAction.status = "completed";
      break;

    case "quarantine_handler":
      console.log(`[SelfHealing] Quarantining handler: ${targetId}`);
      healingAction.status = "completed";
      break;

    default:
      console.log(`[SelfHealing] Action ${action} on ${targetId}`);
      healingAction.status = "completed";
      break;
  }

  healingAction.completedAt = new Date().toISOString();
  return healingAction;
}

export function overrideHealing(id: string, adminId: string): boolean {
  const action = HEALING_HISTORY.get(id);
  if (!action) return false;
  action.status = "overridden";
  action.overriddenBy = adminId;
  action.completedAt = new Date().toISOString();
  return true;
}

export function getHealingHistory(): HealingAction[] {
  return Array.from(HEALING_HISTORY.values());
}

export function getActiveHealingActions(): HealingAction[] {
  return Array.from(HEALING_HISTORY.values()).filter(
    (a) => a.status === "triggered" || a.status === "executing"
  );
}

export function scheduleSelfHealingChecks(): void {
  const CHECK_INTERVAL_MS = 60_000;
  const PAUSE_WARNING_MS = 10 * 60 * 1000;

  setInterval(async () => {
    // Check for open circuits and log healing recommendations
    const { getAllCircuits } = await import("@/lib/governance/circuit-breaker");
    const circuits = getAllCircuits();
    for (const circuit of circuits) {
      if (circuit.state === "open") {
        console.log(
          `[SelfHealing] Recommendation: circuit "${circuit.key}" has been open since ${circuit.openedAt ?? "unknown"}. Consider resetting.`
        );
      }
    }

    // Check if runtime has been paused too long
    if (isRuntimePaused()) {
      const { getOperatorState } = await import("@/lib/governance/operator");
      const opState = getOperatorState();
      if (opState.pausedAt !== null) {
        const pausedMs = Date.now() - new Date(opState.pausedAt).getTime();
        if (pausedMs > PAUSE_WARNING_MS) {
          console.warn(
            `[SelfHealing] WARNING: Runtime has been paused for ${Math.round(pausedMs / 60000)} minutes. Paused by: ${opState.pausedBy ?? "unknown"}. Reason: ${opState.pauseReason ?? "none"}`
          );
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}
