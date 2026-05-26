export const CONTEXT_TTL_MS = 3_600_000; // 1 hour

export interface SharedContext {
  contextId: string;
  tenantId: string;
  domain: string;
  entityId: string;
  data: Record<string, unknown>;
  accessibleBy: string[];
  expiresAt: string;
  createdAt: string;
}

const CONTEXT_STORE = new Map<string, SharedContext>();

export function shareContext(
  ctx: Omit<SharedContext, "contextId" | "createdAt">
): SharedContext {
  const contextId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: SharedContext = { ...ctx, contextId, createdAt: new Date().toISOString() };
  CONTEXT_STORE.set(contextId, full);
  return full;
}

export function getContext(
  contextId: string,
  requestingAgent: string,
  tenantId: string
): SharedContext | null {
  const ctx = CONTEXT_STORE.get(contextId);
  if (!ctx) return null;
  if (new Date(ctx.expiresAt) < new Date()) return null;
  if (ctx.tenantId !== tenantId) return null;
  if (
    !ctx.accessibleBy.includes(requestingAgent) &&
    !ctx.accessibleBy.includes("*")
  ) {
    return null;
  }
  return ctx;
}

export function queryContexts(
  tenantId: string,
  domain: string,
  entityId?: string
): SharedContext[] {
  const now = new Date();
  return Array.from(CONTEXT_STORE.values()).filter((ctx) => {
    if (ctx.tenantId !== tenantId) return false;
    if (ctx.domain !== domain) return false;
    if (entityId !== undefined && ctx.entityId !== entityId) return false;
    if (new Date(ctx.expiresAt) < now) return false;
    return true;
  });
}

export function expireContexts(): number {
  const now = new Date();
  let removed = 0;
  for (const [id, ctx] of Array.from(CONTEXT_STORE.entries())) {
    if (new Date(ctx.expiresAt) < now) {
      CONTEXT_STORE.delete(id);
      removed++;
    }
  }
  return removed;
}
