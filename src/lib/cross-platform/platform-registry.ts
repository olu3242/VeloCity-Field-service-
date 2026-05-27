/**
 * Platform Registry — tracks external platform connections.
 * Pre-registers Stripe and ops-crm. In-memory singleton.
 */

export interface ExternalPlatform {
  id: string;
  name: string;
  type: "erp" | "crm" | "payment" | "logistics" | "custom";
  endpoint: string;
  status: "connected" | "degraded" | "disconnected";
  lastSyncAt?: string;
  latencyMs?: number;
}

export const PLATFORMS: Map<string, ExternalPlatform> = new Map();

// Pre-register default platforms
PLATFORMS.set("stripe-payments", {
  id: "stripe-payments",
  name: "Stripe Payments",
  type: "payment",
  endpoint: "https://api.stripe.com",
  status: "connected",
});

PLATFORMS.set("ops-crm", {
  id: "ops-crm",
  name: "Ops CRM",
  type: "crm",
  endpoint: "https://crm.ops.internal",
  status: "connected",
});

export function registerPlatform(
  platform: Omit<ExternalPlatform, "status">
): ExternalPlatform {
  const registered: ExternalPlatform = { ...platform, status: "disconnected" };
  PLATFORMS.set(platform.id, registered);
  return registered;
}

export function updatePlatformStatus(
  id: string,
  status: ExternalPlatform["status"],
  latencyMs?: number
): void {
  const platform = PLATFORMS.get(id);
  if (!platform) return;
  platform.status = status;
  platform.lastSyncAt = new Date().toISOString();
  if (latencyMs !== undefined) platform.latencyMs = latencyMs;
}

export function getConnectedPlatforms(): ExternalPlatform[] {
  return Array.from(PLATFORMS.values()).filter(
    (p) => p.status === "connected"
  );
}

export function getPlatformsByType(
  type: ExternalPlatform["type"]
): ExternalPlatform[] {
  return Array.from(PLATFORMS.values()).filter((p) => p.type === type);
}
