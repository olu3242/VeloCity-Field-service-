export interface ReplaySession {
  id: string;
  description: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  eventTypes: string[];
  tenantId?: string;
  replayedCount: number;
  failedCount: number;
}

const SESSIONS = new Map<string, ReplaySession>();
const CAP = 50;

export function startReplaySession(
  description: string,
  eventTypes: string[],
  tenantId?: string
): ReplaySession {
  if (SESSIONS.size >= CAP) {
    const firstKey = Array.from(SESSIONS.keys())[0];
    if (firstKey !== undefined) SESSIONS.delete(firstKey);
  }

  const id = crypto.randomUUID();
  const session: ReplaySession = {
    id,
    description,
    startedAt: new Date().toISOString(),
    status: "running",
    eventTypes,
    tenantId,
    replayedCount: 0,
    failedCount: 0,
  };

  SESSIONS.set(id, session);
  return session;
}

export function recordReplayResult(sessionId: string, success: boolean): void {
  const session = SESSIONS.get(sessionId);
  if (!session) return;
  if (success) {
    session.replayedCount++;
  } else {
    session.failedCount++;
  }
}

export function completeReplaySession(
  sessionId: string,
  status: "completed" | "failed" | "cancelled"
): void {
  const session = SESSIONS.get(sessionId);
  if (!session) return;
  session.status = status;
  session.completedAt = new Date().toISOString();
}

export function getActiveSession(): ReplaySession | undefined {
  return Array.from(SESSIONS.values()).find((s) => s.status === "running");
}

export function getSessionHistory(limit = 10): ReplaySession[] {
  return Array.from(SESSIONS.values())
    .filter((s) => s.status !== "running")
    .slice(-limit);
}
