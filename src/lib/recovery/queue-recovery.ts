import type { AutomationEventType } from "@/lib/automation/types";

export type RecoveryAction = "replay" | "discard" | "requeue" | "escalate";

export interface RecoveryItem {
  id: string;
  originalEventId: string;
  eventType: string;
  tenantId?: string;
  payload: Record<string, unknown>;
  error: string;
  recoveryAction?: RecoveryAction;
  recoveredAt?: string;
  attempts: number;
}

const RECOVERY_QUEUE = new Map<string, RecoveryItem>();
const CAP = 500;

export function addToRecovery(
  item: Omit<RecoveryItem, "id" | "recoveryAction" | "recoveredAt">
): RecoveryItem {
  if (RECOVERY_QUEUE.size >= CAP) {
    const firstKey = Array.from(RECOVERY_QUEUE.keys())[0];
    if (firstKey !== undefined) RECOVERY_QUEUE.delete(firstKey);
  }
  const id = crypto.randomUUID();
  const record: RecoveryItem = { ...item, id };
  RECOVERY_QUEUE.set(id, record);
  return record;
}

export async function recoverItem(id: string, action: RecoveryAction): Promise<void> {
  const item = RECOVERY_QUEUE.get(id);
  if (!item) return;

  if (action === "replay") {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent(item.eventType as AutomationEventType, item.payload);
  }

  item.recoveryAction = action;
  item.recoveredAt = new Date().toISOString();
}

export function getRecoveryQueue(tenantId?: string): RecoveryItem[] {
  return Array.from(RECOVERY_QUEUE.values()).filter(
    (item) =>
      item.recoveredAt === undefined &&
      (tenantId === undefined || item.tenantId === tenantId)
  );
}

export function getRecoveryStats(): {
  total: number;
  pending: number;
  recovered: number;
  byAction: Record<string, number>;
} {
  const all = Array.from(RECOVERY_QUEUE.values());
  const total = all.length;
  const pending = all.filter((i) => i.recoveredAt === undefined).length;
  const recovered = total - pending;

  const byAction: Record<string, number> = {};
  for (const item of all) {
    if (item.recoveryAction !== undefined) {
      byAction[item.recoveryAction] = (byAction[item.recoveryAction] ?? 0) + 1;
    }
  }

  return { total, pending, recovered, byAction };
}

export function discardRecoveryItem(id: string, reason: string): void {
  const item = RECOVERY_QUEUE.get(id);
  if (!item) return;
  item.recoveryAction = "discard";
  item.recoveredAt = new Date().toISOString();
  item.error = `${item.error} | Discarded: ${reason}`;
}
