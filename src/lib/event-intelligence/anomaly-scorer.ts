/**
 * Anomaly Scorer — detects unusual event patterns by frequency and payload size.
 * Cap: 500 anomalies (rolling). Persists to enterprise_memory when detected.
 */

import { getAdminClient } from "@/lib/supabase/admin";

export interface EventAnomaly {
  id: string;
  eventType: string;
  tenantId: string;
  anomalyScore: number;
  reason: string;
  detectedAt: string;
}

export const ANOMALIES: EventAnomaly[] = [];
const CAP = 500;

interface AnomalyContext {
  frequency?: number;
  expectedFrequency?: number;
  payloadSize?: number;
}

export function scoreEventAnomaly(
  eventType: string,
  tenantId: string,
  context: AnomalyContext
): EventAnomaly | null {
  let score = 0;
  const reasons: string[] = [];

  const { frequency, expectedFrequency, payloadSize } = context;

  if (
    frequency !== undefined &&
    expectedFrequency !== undefined &&
    expectedFrequency > 0 &&
    frequency > expectedFrequency * 3
  ) {
    score += 0.6;
    reasons.push(`frequency ${frequency} exceeds 3x expected ${expectedFrequency}`);
  }

  if (payloadSize !== undefined && payloadSize > 10_000) {
    score += 0.3;
    reasons.push(`payload size ${payloadSize} bytes exceeds 10kb`);
  }

  if (score <= 0.3) return null;

  const anomaly: EventAnomaly = {
    id: crypto.randomUUID(),
    eventType,
    tenantId,
    anomalyScore: Math.min(score, 1),
    reason: reasons.join("; "),
    detectedAt: new Date().toISOString(),
  };

  if (ANOMALIES.length >= CAP) {
    ANOMALIES.splice(0, 1);
  }

  ANOMALIES.push(anomaly);

  // Persist high-score anomalies to enterprise_memory for durability
  if (anomaly.anomalyScore >= 0.6) {
    try {
      getAdminClient()
        .from("enterprise_memory")
        .insert({
          tenant_id: tenantId,
          category: "event_anomaly",
          entity_type: "event",
          entity_id: anomaly.eventType,
          summary: `Anomaly detected on ${anomaly.eventType}: ${anomaly.reason}`,
          detail: {
            anomalyId: anomaly.id,
            eventType: anomaly.eventType,
            anomalyScore: anomaly.anomalyScore,
            reason: anomaly.reason,
          },
          tags: ["anomaly", anomaly.eventType],
          importance: anomaly.anomalyScore >= 0.8 ? "high" : "normal",
        })
        .then(() => {});
    } catch {
      // non-fatal
    }
  }

  return anomaly;
}

export function getAnomaliesByTenant(tenantId: string): EventAnomaly[] {
  return ANOMALIES.filter((a) => a.tenantId === tenantId);
}

export function getTopAnomalousEvents(limit = 10): EventAnomaly[] {
  return [...ANOMALIES]
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .slice(0, limit);
}
