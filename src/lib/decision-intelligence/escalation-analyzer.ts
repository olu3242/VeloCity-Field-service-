/**
 * Escalation Analyzer — tracks and evaluates escalation necessity and resolution.
 * Cap: 500 analyses (rolling).
 */

export interface EscalationAnalysis {
  id: string;
  eventType: string;
  tenantId: string;
  escalatedTo: string;
  reason: string;
  resolutionTimeMs?: number;
  wasNecessary?: boolean;
  analyzedAt: string;
}

export const ANALYSES: EscalationAnalysis[] = [];
const CAP = 500;

export function recordEscalation(
  eventType: string,
  tenantId: string,
  escalatedTo: string,
  reason: string
): EscalationAnalysis {
  const analysis: EscalationAnalysis = {
    id: crypto.randomUUID(),
    eventType,
    tenantId,
    escalatedTo,
    reason,
    analyzedAt: new Date().toISOString(),
  };

  if (ANALYSES.length >= CAP) {
    ANALYSES.splice(0, 1);
  }
  ANALYSES.push(analysis);
  return analysis;
}

export function resolveEscalation(
  id: string,
  resolutionTimeMs: number,
  wasNecessary: boolean
): void {
  const analysis = ANALYSES.find((a) => a.id === id);
  if (!analysis) return;
  analysis.resolutionTimeMs = resolutionTimeMs;
  analysis.wasNecessary = wasNecessary;
}

export function getUnnecessaryEscalations(): EscalationAnalysis[] {
  return ANALYSES.filter((a) => a.wasNecessary === false);
}

export function getEscalationStats(eventType?: string): {
  total: number;
  avgResolutionMs: number;
  unnecessaryRate: number;
} {
  const filtered = eventType
    ? ANALYSES.filter((a) => a.eventType === eventType)
    : ANALYSES;

  const total = filtered.length;

  const resolved = filtered.filter((a) => a.resolutionTimeMs !== undefined);
  const avgResolutionMs =
    resolved.length > 0
      ? resolved.reduce((sum, a) => sum + (a.resolutionTimeMs ?? 0), 0) /
        resolved.length
      : 0;

  const judged = filtered.filter((a) => a.wasNecessary !== undefined);
  const unnecessaryRate =
    judged.length > 0
      ? judged.filter((a) => a.wasNecessary === false).length / judged.length
      : 0;

  return { total, avgResolutionMs, unnecessaryRate };
}
