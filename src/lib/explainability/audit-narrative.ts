export interface AuditNarrative {
  id: string;
  agentName: string;
  eventType: string;
  tenantId?: string;
  narrative: string;
  keyFactors: string[];
  confidenceStatement: string;
  actionTaken: string;
  timestamp: string;
}

const MAX_NARRATIVES = 500;
const NARRATIVES: AuditNarrative[] = [];

export function generateNarrative(params: {
  agentName: string;
  eventType: string;
  decision: string;
  reasoning: string[];
  confidence: number;
  tenantId?: string;
  actionTaken: string;
}): AuditNarrative {
  if (NARRATIVES.length >= MAX_NARRATIVES) {
    NARRATIVES.shift();
  }

  const narrative = `${params.agentName} processed ${params.eventType} and decided to ${params.decision}. ${params.reasoning[0] ?? ""}. Confidence: ${(params.confidence * 100).toFixed(0)}%.`;
  const keyFactors = params.reasoning.slice(0, 3);

  const confidenceStatement =
    params.confidence >= 0.9
      ? `High confidence (${params.confidence.toFixed(2)})`
      : params.confidence >= 0.7
      ? `Moderate confidence (${params.confidence.toFixed(2)})`
      : `Low confidence (${params.confidence.toFixed(2)})`;

  const record: AuditNarrative = {
    id: crypto.randomUUID(),
    agentName: params.agentName,
    eventType: params.eventType,
    tenantId: params.tenantId,
    narrative,
    keyFactors,
    confidenceStatement,
    actionTaken: params.actionTaken,
    timestamp: new Date().toISOString(),
  };

  NARRATIVES.push(record);
  return record;
}

export function getRecentNarratives(
  agentName?: string,
  limit = 20
): AuditNarrative[] {
  const filtered = agentName
    ? NARRATIVES.filter((n) => n.agentName === agentName)
    : NARRATIVES.slice();
  return filtered.slice(-limit);
}

export function exportNarrativesForTenant(tenantId: string): AuditNarrative[] {
  return NARRATIVES.filter((n) => n.tenantId === tenantId);
}
