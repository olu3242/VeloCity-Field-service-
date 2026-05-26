import { getAdapter } from "@/lib/integrations/adapter-contract";

export type DeliveryStatus = "pending" | "delivered" | "failed" | "retrying" | "dead_letter";

export interface DeliveryRecord {
  deliveryId: string;
  adapterId: string;
  eventType: string;
  payload: Record<string, unknown>;
  tenantId?: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  deliveredAt?: string;
  error?: string;
  createdAt: string;
}

const DELIVERIES = new Map<string, DeliveryRecord>();

function generateId(): string {
  return `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDelivery(
  adapterId: string,
  eventType: string,
  payload: Record<string, unknown>,
  tenantId?: string
): DeliveryRecord {
  const adapter = getAdapter(adapterId);
  const deliveryId = generateId();
  const record: DeliveryRecord = {
    deliveryId,
    adapterId,
    eventType,
    payload,
    tenantId,
    status: "pending",
    attemptCount: 0,
    maxAttempts: adapter?.maxRetries ?? 3,
    createdAt: new Date().toISOString(),
  };
  DELIVERIES.set(deliveryId, record);
  return record;
}

export function recordAttempt(
  deliveryId: string,
  success: boolean,
  error?: string
): DeliveryRecord | null {
  const record = DELIVERIES.get(deliveryId);
  if (!record) return null;

  record.attemptCount++;
  record.lastAttemptAt = new Date().toISOString();

  if (success) {
    record.status = "delivered";
    record.deliveredAt = new Date().toISOString();
    record.error = undefined;
  } else {
    record.error = error;
    if (record.attemptCount >= record.maxAttempts) {
      record.status = "dead_letter";
      record.nextRetryAt = undefined;
    } else {
      record.status = "retrying";
      const backoffMs = record.attemptCount * 60_000;
      record.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    }
  }

  DELIVERIES.set(deliveryId, record);
  return record;
}

export function getDeadLetterQueue(): DeliveryRecord[] {
  return Array.from(DELIVERIES.values()).filter((r) => r.status === "dead_letter");
}

export function getDeliveryStats(): {
  total: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  retrying: number;
} {
  const records = Array.from(DELIVERIES.values());
  return {
    total: records.length,
    delivered: records.filter((r) => r.status === "delivered").length,
    failed: records.filter((r) => r.status === "failed").length,
    deadLetter: records.filter((r) => r.status === "dead_letter").length,
    retrying: records.filter((r) => r.status === "retrying").length,
  };
}

export function replayDeadLetter(deliveryId: string): boolean {
  const record = DELIVERIES.get(deliveryId);
  if (!record) return false;
  record.status = "pending";
  record.attemptCount = 0;
  record.nextRetryAt = undefined;
  record.error = undefined;
  DELIVERIES.set(deliveryId, record);
  return true;
}
