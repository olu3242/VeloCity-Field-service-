export interface EscalationTimer {
  id: string;
  slaEntryId: string;
  tenantId: string;
  eventType: string;
  scheduledAt: number;
  escalationLevel: 1 | 2 | 3;
  fired: boolean;
  firedAt?: number;
}

const TIMERS: Map<string, EscalationTimer> = new Map();
const TIMERS_CAP = 500;

export function scheduleEscalation(
  slaEntryId: string,
  tenantId: string,
  eventType: string,
  delayMs: number,
  level: EscalationTimer["escalationLevel"]
): EscalationTimer {
  if (TIMERS.size >= TIMERS_CAP) {
    const oldestKey = TIMERS.keys().next().value;
    if (oldestKey !== undefined) TIMERS.delete(oldestKey);
  }
  const timer: EscalationTimer = {
    id: crypto.randomUUID(),
    slaEntryId,
    tenantId,
    eventType,
    scheduledAt: Date.now() + delayMs,
    escalationLevel: level,
    fired: false,
  };
  TIMERS.set(timer.id, timer);
  return timer;
}

export async function checkAndFireTimers(): Promise<number> {
  const now = Date.now();
  const due = Array.from(TIMERS.values()).filter(
    (t) => !t.fired && t.scheduledAt <= now
  );

  const { emitEvent } = await import("@/lib/automation/emitEvent");

  for (const timer of due) {
    timer.fired = true;
    timer.firedAt = now;
    await emitEvent("sla_escalate", {
      slaEntryId: timer.slaEntryId,
      tenantId: timer.tenantId,
      eventType: timer.eventType,
      escalationLevel: timer.escalationLevel,
    });
  }

  return due.length;
}

export function cancelTimers(slaEntryId: string): void {
  Array.from(TIMERS.values())
    .filter((t) => t.slaEntryId === slaEntryId)
    .forEach((t) => { t.fired = true; });
}

export function getPendingTimers(tenantId?: string): EscalationTimer[] {
  return Array.from(TIMERS.values()).filter(
    (t) =>
      !t.fired &&
      (tenantId === undefined || t.tenantId === tenantId)
  );
}

export function getTimerStats(): { total: number; pending: number; fired: number } {
  const all = Array.from(TIMERS.values());
  const fired = all.filter((t) => t.fired).length;
  return { total: all.length, pending: all.length - fired, fired };
}
