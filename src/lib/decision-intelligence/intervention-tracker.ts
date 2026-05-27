/**
 * Intervention Tracker — logs manual overrides, approvals, rollbacks, escalations.
 * Cap: 500 interventions (rolling).
 */

export interface Intervention {
  id: string;
  agentName: string;
  tenantId: string;
  interventionType: "override" | "approval" | "rollback" | "escalation";
  trigger: string;
  effectMs?: number;
  successful?: boolean;
  recordedAt: string;
}

export const INTERVENTIONS: Intervention[] = [];
const CAP = 500;

export function recordIntervention(
  agentName: string,
  tenantId: string,
  interventionType: Intervention["interventionType"],
  trigger: string
): Intervention {
  const intervention: Intervention = {
    id: crypto.randomUUID(),
    agentName,
    tenantId,
    interventionType,
    trigger,
    recordedAt: new Date().toISOString(),
  };

  if (INTERVENTIONS.length >= CAP) {
    INTERVENTIONS.splice(0, 1);
  }
  INTERVENTIONS.push(intervention);
  return intervention;
}

export function resolveIntervention(
  id: string,
  effectMs: number,
  successful: boolean
): void {
  const intervention = INTERVENTIONS.find((i) => i.id === id);
  if (!intervention) return;
  intervention.effectMs = effectMs;
  intervention.successful = successful;
}

export function getInterventionsByType(
  type: Intervention["interventionType"]
): Intervention[] {
  return INTERVENTIONS.filter((i) => i.interventionType === type);
}

export function getInterventionEffectiveness(): {
  total: number;
  successRate: number;
  avgEffectMs: number;
} {
  const total = INTERVENTIONS.length;

  const resolved = INTERVENTIONS.filter((i) => i.successful !== undefined);
  const successRate =
    resolved.length > 0
      ? resolved.filter((i) => i.successful === true).length / resolved.length
      : 0;

  const timed = INTERVENTIONS.filter((i) => i.effectMs !== undefined);
  const avgEffectMs =
    timed.length > 0
      ? timed.reduce((sum, i) => sum + (i.effectMs ?? 0), 0) / timed.length
      : 0;

  return { total, successRate, avgEffectMs };
}
