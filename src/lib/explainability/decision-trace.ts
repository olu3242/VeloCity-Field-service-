export interface DecisionTrace {
  traceId: string;
  agentName: string;
  eventType: string;
  tenantId?: string;
  inputSummary: string;
  steps: {
    step: number;
    action: string;
    result: string;
    confidenceDelta: number;
  }[];
  finalDecision: string;
  finalConfidence: number;
  startedAt: string;
  completedAt?: string;
}

const MAX_TRACES = 500;
const TRACES: Map<string, DecisionTrace> = new Map();

export function startTrace(
  agentName: string,
  eventType: string,
  inputSummary: string,
  tenantId?: string
): DecisionTrace {
  if (TRACES.size >= MAX_TRACES) {
    const oldestKey = TRACES.keys().next().value;
    if (oldestKey !== undefined) {
      TRACES.delete(oldestKey);
    }
  }

  const trace: DecisionTrace = {
    traceId: crypto.randomUUID(),
    agentName,
    eventType,
    tenantId,
    inputSummary,
    steps: [],
    finalDecision: "",
    finalConfidence: 0,
    startedAt: new Date().toISOString(),
  };

  TRACES.set(trace.traceId, trace);
  return trace;
}

export function addStep(
  traceId: string,
  action: string,
  result: string,
  confidenceDelta: number
): void {
  const trace = TRACES.get(traceId);
  if (!trace) return;
  trace.steps.push({
    step: trace.steps.length + 1,
    action,
    result,
    confidenceDelta,
  });
}

export function completeTrace(
  traceId: string,
  finalDecision: string,
  finalConfidence: number
): void {
  const trace = TRACES.get(traceId);
  if (!trace) return;
  trace.finalDecision = finalDecision;
  trace.finalConfidence = finalConfidence;
  trace.completedAt = new Date().toISOString();
}

export function getTrace(traceId: string): DecisionTrace | undefined {
  return TRACES.get(traceId);
}

export function getTracesByAgent(
  agentName: string,
  limit = 20
): DecisionTrace[] {
  return Array.from(TRACES.values())
    .filter((t) => t.agentName === agentName)
    .slice(-limit);
}
