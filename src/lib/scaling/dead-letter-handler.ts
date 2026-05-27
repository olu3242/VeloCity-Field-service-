export interface DeadLetterItem {
  id: string;
  source: "automation_queue" | "delivery" | "webhook" | "agent_execution";
  eventType: string;
  payload: Record<string, unknown>;
  failureReason: string;
  attemptCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  tenantId?: string;
  status: "pending_review" | "replaying" | "resolved" | "discarded";
}

const DLQ = new Map<string, DeadLetterItem>();

function generateId(): string {
  return `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function addToDeadLetter(
  item: Omit<DeadLetterItem, "id" | "status">
): DeadLetterItem {
  const id = generateId();
  const entry: DeadLetterItem = { ...item, id, status: "pending_review" };
  DLQ.set(id, entry);
  return entry;
}

export async function replayItem(
  id: string
): Promise<{ replayed: boolean; error?: string }> {
  const item = DLQ.get(id);
  if (!item) return { replayed: false, error: "Item not found" };

  item.status = "replaying";
  DLQ.set(id, item);

  try {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent(item.eventType, item.payload);
    item.status = "resolved";
    DLQ.set(id, item);
    return { replayed: true };
  } catch (err) {
    item.status = "pending_review";
    DLQ.set(id, item);
    const message = err instanceof Error ? err.message : String(err);
    return { replayed: false, error: message };
  }
}

export function discardItem(id: string, _reason: string): boolean {
  const item = DLQ.get(id);
  if (!item) return false;
  item.status = "discarded";
  DLQ.set(id, item);
  return true;
}

export function getDLQItems(status?: DeadLetterItem["status"]): DeadLetterItem[] {
  const all = Array.from(DLQ.values());
  if (status === undefined) return all;
  return all.filter((item) => item.status === status);
}

export function getDLQStats(): {
  total: number;
  pendingReview: number;
  replaying: number;
  resolved: number;
  discarded: number;
} {
  const all = Array.from(DLQ.values());
  return {
    total: all.length,
    pendingReview: all.filter((i) => i.status === "pending_review").length,
    replaying: all.filter((i) => i.status === "replaying").length,
    resolved: all.filter((i) => i.status === "resolved").length,
    discarded: all.filter((i) => i.status === "discarded").length,
  };
}
