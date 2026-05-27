export type AnomalySignalType =
  | "rapid_event_burst"
  | "unusual_event_sequence"
  | "cross_tenant_access_attempt"
  | "repeated_auth_failure"
  | "abnormal_ai_usage"
  | "payload_size_anomaly"
  | "execution_time_anomaly";

export interface SecurityAnomaly {
  id: string;
  tenantId?: string;
  signalType: AnomalySignalType;
  score: number;
  context: Record<string, unknown>;
  detectedAt: string;
  resolved: boolean;
  resolvedAt?: string;
}

const ANOMALIES: Map<string, SecurityAnomaly> = new Map();
const ANOMALY_COUNTS: Map<string, number> = new Map();
const MAX_ANOMALIES = 500;

const SIGNAL_SCORES: Record<AnomalySignalType, number> = {
  rapid_event_burst: 70,
  unusual_event_sequence: 55,
  cross_tenant_access_attempt: 95,
  repeated_auth_failure: 60,
  abnormal_ai_usage: 65,
  payload_size_anomaly: 45,
  execution_time_anomaly: 40,
};

export function scoreAnomaly(
  signalType: AnomalySignalType,
  context: Record<string, unknown>,
  tenantId?: string
): SecurityAnomaly {
  if (ANOMALIES.size >= MAX_ANOMALIES) {
    const oldest = Array.from(ANOMALIES.keys())[0];
    if (oldest) ANOMALIES.delete(oldest);
  }

  const id = `anm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const anomaly: SecurityAnomaly = {
    id,
    tenantId,
    signalType,
    score: SIGNAL_SCORES[signalType],
    context,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };

  ANOMALIES.set(id, anomaly);

  if (tenantId) {
    ANOMALY_COUNTS.set(tenantId, (ANOMALY_COUNTS.get(tenantId) ?? 0) + 1);
  }

  return anomaly;
}

export function resolveAnomaly(id: string): void {
  const anomaly = ANOMALIES.get(id);
  if (anomaly) {
    anomaly.resolved = true;
    anomaly.resolvedAt = new Date().toISOString();
  }
}

export function getActiveAnomalies(tenantId?: string): SecurityAnomaly[] {
  return Array.from(ANOMALIES.values()).filter(
    (a) => !a.resolved && (tenantId === undefined || a.tenantId === tenantId)
  );
}

export function getAnomalyScore(tenantId: string): number {
  const total = Array.from(ANOMALIES.values())
    .filter((a) => !a.resolved && a.tenantId === tenantId)
    .reduce((sum, a) => sum + a.score, 0);
  return Math.min(total, 100);
}

export function getRecentAnomalies(limit = 20): SecurityAnomaly[] {
  const all = Array.from(ANOMALIES.values());
  return all.slice(-limit).reverse();
}
