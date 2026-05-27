/**
 * Tenant Context — hydrates and caches per-tenant context with TTL expiry.
 */

export interface TenantContext {
  id: string;
  tenantId: string;
  tier: "standard" | "premium" | "enterprise";
  features: string[];
  limits: Record<string, number>;
  hydratedAt: string;
  expiresAt: string;
}

const CONTEXTS: Map<string, TenantContext> = new Map();
const CAP = 500;
const TTL_MS = 300_000;

function evictIfFull(): void {
  if (CONTEXTS.size >= CAP) {
    const firstKey = Array.from(CONTEXTS.keys())[0];
    if (firstKey !== undefined) CONTEXTS.delete(firstKey);
  }
}

export function hydrateTenantContext(
  tenantId: string,
  tier: TenantContext["tier"],
  features: string[],
  limits: Record<string, number>
): TenantContext {
  evictIfFull();
  const now = Date.now();
  const ctx: TenantContext = {
    id: crypto.randomUUID(),
    tenantId,
    tier,
    features,
    limits,
    hydratedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  CONTEXTS.set(tenantId, ctx);
  return ctx;
}

export function getTenantContext(tenantId: string): TenantContext | undefined {
  const ctx = CONTEXTS.get(tenantId);
  if (!ctx) return undefined;
  if (Date.now() > new Date(ctx.expiresAt).getTime()) {
    CONTEXTS.delete(tenantId);
    return undefined;
  }
  return ctx;
}

export function invalidateContext(tenantId: string): void {
  CONTEXTS.delete(tenantId);
}

export function getActiveContextCount(): number {
  const now = Date.now();
  return Array.from(CONTEXTS.values()).filter(
    (ctx) => now <= new Date(ctx.expiresAt).getTime()
  ).length;
}
