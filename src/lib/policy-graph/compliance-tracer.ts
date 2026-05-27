/**
 * Compliance Tracer — records which policies were evaluated per event and final outcome.
 * Cap: 500 traces (rolling).
 */

export interface ComplianceTrace {
  id: string;
  eventType: string;
  tenantId: string;
  policiesEvaluated: string[];
  finalOutcome: "compliant" | "violation" | "warning";
  traceAt: string;
}

export const TRACES: ComplianceTrace[] = [];
const CAP = 500;

export function recordTrace(
  eventType: string,
  tenantId: string,
  policiesEvaluated: string[],
  finalOutcome: ComplianceTrace["finalOutcome"]
): ComplianceTrace {
  const trace: ComplianceTrace = {
    id: crypto.randomUUID(),
    eventType,
    tenantId,
    policiesEvaluated,
    finalOutcome,
    traceAt: new Date().toISOString(),
  };

  if (TRACES.length >= CAP) {
    TRACES.splice(0, 1);
  }
  TRACES.push(trace);
  return trace;
}

export function getTracesByOutcome(
  outcome: ComplianceTrace["finalOutcome"]
): ComplianceTrace[] {
  return TRACES.filter((t) => t.finalOutcome === outcome);
}

export function getComplianceRate(eventType?: string): number {
  const filtered = eventType
    ? TRACES.filter((t) => t.eventType === eventType)
    : TRACES;
  if (filtered.length === 0) return 0;
  const compliant = filtered.filter((t) => t.finalOutcome === "compliant").length;
  return compliant / filtered.length;
}

export function getRecentTraces(limit = 20): ComplianceTrace[] {
  return TRACES.slice(-limit);
}
