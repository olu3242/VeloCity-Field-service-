export interface SharedContext {
  id: string;
  sessionId: string;
  tenantId: string;
  participants: string[];
  contextData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const CONTEXTS = new Map<string, SharedContext>();
const CAP = 200;

export function createSharedContext(
  sessionId: string,
  tenantId: string,
  participants: string[],
  contextData: Record<string, unknown> = {}
): SharedContext {
  if (CONTEXTS.size >= CAP) {
    const oldestKey = Array.from(CONTEXTS.keys())[0];
    CONTEXTS.delete(oldestKey);
  }
  const now = new Date().toISOString();
  const ctx: SharedContext = {
    id: crypto.randomUUID(),
    sessionId,
    tenantId,
    participants,
    contextData,
    createdAt: now,
    updatedAt: now,
  };
  CONTEXTS.set(sessionId, ctx);
  return ctx;
}

export function updateSharedContext(
  sessionId: string,
  patch: Record<string, unknown>
): void {
  const ctx = CONTEXTS.get(sessionId);
  if (!ctx) return;
  ctx.contextData = { ...ctx.contextData, ...patch };
  ctx.updatedAt = new Date().toISOString();
}

export function getSharedContext(sessionId: string): SharedContext | undefined {
  return CONTEXTS.get(sessionId);
}

export function getContextsByTenant(tenantId: string): SharedContext[] {
  return Array.from(CONTEXTS.values()).filter((c) => c.tenantId === tenantId);
}
