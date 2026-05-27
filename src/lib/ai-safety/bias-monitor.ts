/**
 * Bias Monitor — records and reports fairness signals across agents.
 * Cap: 200 entries (rolling).
 */

export interface BiasSignal {
  id: string;
  agentName: string;
  dimension: "tenant_size" | "provider_tier" | "geography" | "dispute_value";
  detectedAt: string;
  detail: string;
  severity: "low" | "medium" | "high";
}

export const BIAS_LOG: BiasSignal[] = [];
const CAP = 200;

export function recordBiasSignal(
  agentName: string,
  dimension: BiasSignal["dimension"],
  detail: string,
  severity: BiasSignal["severity"]
): BiasSignal {
  const signal: BiasSignal = {
    id: crypto.randomUUID(),
    agentName,
    dimension,
    detectedAt: new Date().toISOString(),
    detail,
    severity,
  };

  if (BIAS_LOG.length >= CAP) {
    BIAS_LOG.splice(0, 1);
  }

  BIAS_LOG.push(signal);
  return signal;
}

export function getBiasReport(agentName?: string): {
  totalSignals: number;
  byDimension: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const filtered = agentName
    ? BIAS_LOG.filter((s) => s.agentName === agentName)
    : [...BIAS_LOG];

  const byDimension: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const signal of filtered) {
    byDimension[signal.dimension] = (byDimension[signal.dimension] ?? 0) + 1;
    bySeverity[signal.severity] = (bySeverity[signal.severity] ?? 0) + 1;
  }

  return {
    totalSignals: filtered.length,
    byDimension,
    bySeverity,
  };
}

export function getHighSeveritySignals(): BiasSignal[] {
  return BIAS_LOG.filter((s) => s.severity === "high");
}
