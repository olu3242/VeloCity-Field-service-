/**
 * Trust Signal Log — append-only log of trust signal events per entity.
 */

export interface TrustSignalEvent {
  id: string;
  entityId: string;
  entityType: "provider" | "customer";
  tenantId: string;
  signalType: string;
  value: number;
  recordedAt: string;
}

const SIGNAL_LOG: TrustSignalEvent[] = [];
const CAP = 1000;

export function recordTrustSignal(
  entityId: string,
  entityType: TrustSignalEvent["entityType"],
  tenantId: string,
  signalType: string,
  value: number
): TrustSignalEvent {
  if (SIGNAL_LOG.length >= CAP) SIGNAL_LOG.shift();
  const event: TrustSignalEvent = {
    id: crypto.randomUUID(),
    entityId,
    entityType,
    tenantId,
    signalType,
    value,
    recordedAt: new Date().toISOString(),
  };
  SIGNAL_LOG.push(event);
  return event;
}

export function getSignalsForEntity(entityId: string, limit?: number): TrustSignalEvent[] {
  const filtered = SIGNAL_LOG.filter((e) => e.entityId === entityId);
  return limit !== undefined ? filtered.slice(-limit) : filtered;
}

export function getSignalSummary(
  entityId: string
): { totalSignals: number; avgValue: number; positiveSignals: number; negativeSignals: number } {
  const signals = SIGNAL_LOG.filter((e) => e.entityId === entityId);
  const totalSignals = signals.length;
  if (totalSignals === 0) {
    return { totalSignals: 0, avgValue: 0, positiveSignals: 0, negativeSignals: 0 };
  }
  const avgValue = signals.reduce((s, e) => s + e.value, 0) / totalSignals;
  const positiveSignals = signals.filter((e) => e.value > 0).length;
  const negativeSignals = signals.filter((e) => e.value < 0).length;
  return { totalSignals, avgValue, positiveSignals, negativeSignals };
}
