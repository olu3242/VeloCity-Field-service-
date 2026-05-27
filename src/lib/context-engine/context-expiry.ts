/**
 * Context Expiry Policies — TTL management and expiry evaluation.
 */

export interface ContextExpiryPolicy {
  contextType: string;
  ttlMs: number;
  onExpiry: "purge" | "archive" | "notify";
}

const POLICIES: Map<string, ContextExpiryPolicy> = new Map();

// Pre-registered policies
const DEFAULT_POLICIES: ContextExpiryPolicy[] = [
  { contextType: "tenant_context", ttlMs: 300_000, onExpiry: "purge" },
  { contextType: "workflow_context", ttlMs: 3_600_000, onExpiry: "archive" },
  { contextType: "ai_snapshot", ttlMs: 600_000, onExpiry: "purge" },
];

for (const policy of DEFAULT_POLICIES) {
  POLICIES.set(policy.contextType, policy);
}

export function registerExpiryPolicy(policy: ContextExpiryPolicy): void {
  POLICIES.set(policy.contextType, policy);
}

export function getExpiryPolicy(contextType: string): ContextExpiryPolicy | undefined {
  return POLICIES.get(contextType);
}

export function shouldExpire(contextType: string, createdAt: string): boolean {
  const policy = POLICIES.get(contextType);
  if (!policy) return false;
  return Date.now() - new Date(createdAt).getTime() > policy.ttlMs;
}

export function getExpiredContextTypes(createdAt: string): string[] {
  return Array.from(POLICIES.values())
    .filter((policy) => shouldExpire(policy.contextType, createdAt))
    .map((policy) => policy.contextType);
}
