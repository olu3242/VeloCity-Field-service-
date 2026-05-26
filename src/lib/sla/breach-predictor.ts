export type SLAStatus = "safe" | "at_risk" | "breached" | "resolved";

export interface SLAEntry {
  id: string;
  tenantId: string;
  eventType: string;
  slaDeadlineMs: number;
  createdAt: number;
  status: SLAStatus;
  urgency?: "low" | "medium" | "high" | "emergency";
  jobId?: string;
  resolvedAt?: number;
}

export interface SLABreachPrediction {
  entryId: string;
  tenantId: string;
  eventType: string;
  timeRemainingMs: number;
  atRiskThresholdMs: number;
  predictedStatus: SLAStatus;
  riskScore: number;
}

const SLA_ENTRIES: Map<string, SLAEntry> = new Map();
const SLA_ENTRIES_CAP = 1000;
const AT_RISK_THRESHOLD_MS = 5 * 60 * 1000;

export function registerSLA(
  entry: Omit<SLAEntry, "id" | "status">
): SLAEntry {
  if (SLA_ENTRIES.size >= SLA_ENTRIES_CAP) {
    const oldestKey = SLA_ENTRIES.keys().next().value;
    if (oldestKey !== undefined) SLA_ENTRIES.delete(oldestKey);
  }
  const id = crypto.randomUUID();
  const newEntry: SLAEntry = { ...entry, id, status: "safe" };
  SLA_ENTRIES.set(id, newEntry);
  return newEntry;
}

export function predictBreach(entryId: string): SLABreachPrediction {
  const entry = SLA_ENTRIES.get(entryId);
  if (!entry) throw new Error(`SLA entry not found: ${entryId}`);

  const timeRemainingMs = entry.slaDeadlineMs - Date.now();
  let predictedStatus: SLAStatus;
  let riskScore: number;

  if (timeRemainingMs < 0) {
    predictedStatus = "breached";
    riskScore = 100;
  } else if (timeRemainingMs < AT_RISK_THRESHOLD_MS) {
    predictedStatus = "at_risk";
    riskScore = Math.min(100, Math.max(0, 100 - (timeRemainingMs / AT_RISK_THRESHOLD_MS) * 100));
  } else {
    predictedStatus = "safe";
    riskScore = Math.min(100, Math.max(0, 100 - (timeRemainingMs / AT_RISK_THRESHOLD_MS) * 100));
  }

  return {
    entryId,
    tenantId: entry.tenantId,
    eventType: entry.eventType,
    timeRemainingMs,
    atRiskThresholdMs: AT_RISK_THRESHOLD_MS,
    predictedStatus,
    riskScore,
  };
}

export function getAtRiskSLAs(tenantId?: string): SLABreachPrediction[] {
  return Array.from(SLA_ENTRIES.values())
    .filter((entry) => {
      if (entry.status === "resolved") return false;
      if (tenantId !== undefined && entry.tenantId !== tenantId) return false;
      return true;
    })
    .map((entry) => predictBreach(entry.id))
    .filter(
      (p) => p.predictedStatus === "at_risk" || p.predictedStatus === "breached"
    );
}

export function resolveSLA(entryId: string): void {
  const entry = SLA_ENTRIES.get(entryId);
  if (!entry) return;
  entry.status = "resolved";
  entry.resolvedAt = Date.now();
}

export function updateSLAStatus(entryId: string, status: SLAStatus): void {
  const entry = SLA_ENTRIES.get(entryId);
  if (!entry) return;
  entry.status = status;
}
