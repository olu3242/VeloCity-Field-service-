export interface PluginHook {
  event: string;
  handler: string;
  priority: number;
  async: boolean;
}

export type PluginType = "integration" | "automation" | "ai_tool" | "analytics" | "notification" | "workflow";
export type PluginStatus = "active" | "disabled" | "error";

export interface VeloPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;
  hooks: PluginHook[];
  status: PluginStatus;
  tenantId?: string;
  metadata: Record<string, unknown>;
}

export const PLUGIN_REGISTRY = new Map<string, VeloPlugin>();

export function registerPlugin(plugin: VeloPlugin): void {
  PLUGIN_REGISTRY.set(plugin.id, plugin);
}

export function unregisterPlugin(id: string): void {
  PLUGIN_REGISTRY.delete(id);
}

export function getPlugin(id: string): VeloPlugin | null {
  return PLUGIN_REGISTRY.get(id) ?? null;
}

export function getActivePlugins(tenantId?: string): VeloPlugin[] {
  return Array.from(PLUGIN_REGISTRY.values()).filter(
    (p) =>
      p.status === "active" &&
      (p.tenantId === undefined || p.tenantId === tenantId)
  );
}

export function getPluginsForHook(hookEvent: string, tenantId?: string): VeloPlugin[] {
  return Array.from(getActivePlugins(tenantId))
    .filter((p) => p.hooks.some((h) => h.event === hookEvent))
    .sort((a, b) => {
      const pa = Math.min(...a.hooks.filter((h) => h.event === hookEvent).map((h) => h.priority));
      const pb = Math.min(...b.hooks.filter((h) => h.event === hookEvent).map((h) => h.priority));
      return pa - pb;
    });
}

// Pre-register built-in plugins on module load
registerPlugin({
  id: "stripe-adapter",
  name: "Stripe Payments",
  version: "1.0.0",
  description: "Stripe webhook and payment routing",
  type: "integration",
  hooks: [
    {
      event: "before:payout_release",
      handler: "validateStripePayment",
      priority: 1,
      async: true,
    },
  ],
  status: "active",
  metadata: { provider: "stripe" },
});

registerPlugin({
  id: "supabase-notifications",
  name: "Supabase Realtime Notifications",
  version: "1.0.0",
  description: "In-app notification delivery via Supabase",
  type: "notification",
  hooks: [
    {
      event: "after:event_emitted",
      handler: "routeToNotifications",
      priority: 10,
      async: true,
    },
  ],
  status: "active",
  metadata: { channel: "in_app" },
});

registerPlugin({
  id: "gabriel-audit",
  name: "GABRIEL Governance Audit",
  version: "1.0.0",
  description: "Universal audit log for all automation events",
  type: "automation",
  hooks: [
    {
      event: "after:event_emitted",
      handler: "auditLog",
      priority: 1,
      async: false,
    },
  ],
  status: "active",
  metadata: { agent: "GABRIEL" },
});
