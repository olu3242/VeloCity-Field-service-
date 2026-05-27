/**
 * Escalation Path Analytics — tracks escalation paths and resolution metrics.
 */

export interface EscalationPath {
  id: string;
  tenantId: string;
  eventType: string;
  path: string[];
  totalMs: number;
  resolved: boolean;
  recordedAt: string;
}

const PATHS: EscalationPath[] = [];
const CAP = 300;

export function recordEscalationPath(
  tenantId: string,
  eventType: string,
  path: string[],
  totalMs: number,
  resolved: boolean
): EscalationPath {
  if (PATHS.length >= CAP) PATHS.shift();
  const record: EscalationPath = {
    id: crypto.randomUUID(),
    tenantId,
    eventType,
    path,
    totalMs,
    resolved,
    recordedAt: new Date().toISOString(),
  };
  PATHS.push(record);
  return record;
}

export function getPathStats(
  eventType?: string
): { avgPathLength: number; avgTotalMs: number; resolutionRate: number; commonFirstStep: string } {
  const subset = eventType
    ? PATHS.filter((p) => p.eventType === eventType)
    : PATHS;
  const total = subset.length;
  if (total === 0) {
    return { avgPathLength: 0, avgTotalMs: 0, resolutionRate: 0, commonFirstStep: "" };
  }
  const avgPathLength = subset.reduce((s, p) => s + p.path.length, 0) / total;
  const avgTotalMs = subset.reduce((s, p) => s + p.totalMs, 0) / total;
  const resolutionRate = subset.filter((p) => p.resolved).length / total;

  const firstStepCounts = new Map<string, number>();
  for (const p of subset) {
    const first = p.path[0];
    if (first !== undefined) {
      firstStepCounts.set(first, (firstStepCounts.get(first) ?? 0) + 1);
    }
  }
  const commonFirstStep =
    Array.from(firstStepCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return { avgPathLength, avgTotalMs, resolutionRate, commonFirstStep };
}

export function getLongRunningPaths(thresholdMs = 300_000): EscalationPath[] {
  return PATHS.filter((p) => p.totalMs > thresholdMs).sort((a, b) => {
    if (!a.resolved && b.resolved) return -1;
    if (a.resolved && !b.resolved) return 1;
    return 0;
  });
}
