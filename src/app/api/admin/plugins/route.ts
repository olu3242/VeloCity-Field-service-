// GET  /api/admin/plugins — plugins visible to this tenant, hook points, plugins per hook
// POST /api/admin/plugins — register_plugin | unregister_plugin | set_status
//                           | plugins_for_hook | execute_hook
// Admin-only.
//
// Plugins with no tenantId are platform-wide built-ins visible to every tenant; plugins with
// a tenantId are private to that tenant. Registering or removing a platform-wide plugin
// requires super_admin.
//
// registerHookHandler() is deliberately NOT exposed: it takes a JavaScript callback, which
// has no meaningful HTTP representation and would mean accepting executable code over the
// wire. Programmatic handlers belong to process bootstrap.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  PLUGIN_REGISTRY,
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  getActivePlugins,
  getPluginsForHook,
  type VeloPlugin,
  type PluginHook,
  type PluginType,
  type PluginStatus,
} from "@/lib/plugins/registry";
import { executeHook, type HookPoint } from "@/lib/plugins/hooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PLUGIN_TYPES: PluginType[] = [
  "integration", "automation", "ai_tool", "analytics", "notification", "workflow",
];
const VALID_PLUGIN_STATUSES: PluginStatus[] = ["active", "disabled", "error"];
const VALID_HOOK_POINTS: HookPoint[] = [
  "before:agent_execution", "after:agent_execution",
  "before:event_emitted", "after:event_emitted",
  "on:circuit_open", "on:circuit_close",
  "on:runtime_pause", "on:runtime_resume",
  "on:handler_error", "on:queue_flood",
  "after:workflow_complete", "before:payout_release", "before:dispute_resolve",
];

function isHookPoint(value: unknown): value is HookPoint {
  return typeof value === "string" && VALID_HOOK_POINTS.includes(value as HookPoint);
}

// Parses and validates a plugin's hook array.
function parseHooks(raw: unknown): { hooks: PluginHook[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "hooks must be a non-empty array" };
  }
  const hooks: PluginHook[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { error: "each hook must be an object" };
    }
    const h = entry as Record<string, unknown>;
    if (!isHookPoint(h.event)) {
      return { error: `hook.event must be one of: ${VALID_HOOK_POINTS.join(", ")}` };
    }
    if (typeof h.handler !== "string" || h.handler.trim() === "") {
      return { error: "each hook requires a handler name" };
    }
    if (h.priority !== undefined && typeof h.priority !== "number") {
      return { error: "hook.priority must be a number" };
    }
    hooks.push({
      event: h.event,
      handler: h.handler,
      priority: typeof h.priority === "number" ? h.priority : 10,
      async: h.async !== false,
    });
  }
  return { hooks };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

// A plugin is visible if platform-wide (no tenantId) or owned by this tenant.
function visible(plugin: VeloPlugin, tenantId: string): boolean {
  return plugin.tenantId === undefined || plugin.tenantId === tenantId;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const hookEvent = url.searchParams.get("hookEvent");
  const pluginId = url.searchParams.get("pluginId");

  const requested = pluginId ? getPlugin(pluginId) : null;

  return NextResponse.json({
    plugins: {
      // The registry map includes disabled and errored plugins; scope by visibility.
      all: Array.from(PLUGIN_REGISTRY.values()).filter((p) => visible(p, tenantId)),
      active: getActivePlugins(tenantId),
      ...(pluginId
        ? { plugin: requested && visible(requested, tenantId) ? requested : null }
        : {}),
      ...(hookEvent ? { forHook: getPluginsForHook(hookEvent, tenantId) } : {}),
    },
    supported: {
      pluginTypes: VALID_PLUGIN_TYPES,
      pluginStatuses: VALID_PLUGIN_STATUSES,
      hookPoints: VALID_HOOK_POINTS,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "register_plugin") {
    const { id, name, version, description, type, hooks, status, platformWide, metadata } = raw;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (typeof name !== "string" || typeof version !== "string") {
      return NextResponse.json({ error: "name and version required" }, { status: 400 });
    }
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    if (!VALID_PLUGIN_TYPES.includes(type as PluginType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_PLUGIN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (status !== undefined && !VALID_PLUGIN_STATUSES.includes(status as PluginStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_PLUGIN_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // A plugin with no tenantId runs for every tenant.
    if (platformWide === true && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — platform-wide plugins require super_admin" },
        { status: 403 }
      );
    }
    // registerPlugin overwrites by id, which would silently replace a built-in
    // (stripe-adapter, gabriel-audit, …) or another tenant's plugin.
    const existing = getPlugin(id);
    if (existing) {
      return NextResponse.json(
        { error: `Plugin '${id}' already exists — unregister it first or choose another id` },
        { status: 409 }
      );
    }

    const parsed = parseHooks(hooks);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const plugin: VeloPlugin = {
      id,
      name,
      version,
      description,
      type: type as PluginType,
      hooks: parsed.hooks,
      status: (status as PluginStatus) ?? "active",
      ...(platformWide === true ? {} : { tenantId }),
      metadata:
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {},
    };
    registerPlugin(plugin);
    return NextResponse.json({ action: "register_plugin", plugin, success: true }, { status: 201 });
  }

  if (action === "unregister_plugin" || action === "set_status") {
    const { id, status } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const plugin = getPlugin(id);
    if (!plugin || !visible(plugin, tenantId)) {
      return NextResponse.json({ error: "Plugin not found for this tenant" }, { status: 404 });
    }
    // Platform-wide plugins (including the built-ins) affect every tenant.
    if (plugin.tenantId === undefined && !isSuperAdmin) {
      return NextResponse.json(
        { error: `Forbidden — '${id}' is a platform-wide plugin and requires super_admin` },
        { status: 403 }
      );
    }

    if (action === "unregister_plugin") {
      unregisterPlugin(id);
      return NextResponse.json({ action: "unregister_plugin", id, success: true });
    }

    if (!VALID_PLUGIN_STATUSES.includes(status as PluginStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_PLUGIN_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    // The registry has no update function; re-register the same object with the
    // new status, preserving every other field.
    registerPlugin({ ...plugin, status: status as PluginStatus });
    return NextResponse.json({
      action: "set_status",
      plugin: getPlugin(id),
      success: true,
    });
  }

  if (action === "plugins_for_hook") {
    const { hookEvent } = raw;
    if (typeof hookEvent !== "string" || hookEvent.trim() === "") {
      return NextResponse.json({ error: "hookEvent required" }, { status: 400 });
    }
    return NextResponse.json({
      action: "plugins_for_hook",
      plugins: getPluginsForHook(hookEvent, tenantId),
      success: true,
    });
  }

  if (action === "execute_hook") {
    const { hookPoint, payload, traceId } = raw;
    if (!isHookPoint(hookPoint)) {
      return NextResponse.json(
        { error: `hookPoint must be one of: ${VALID_HOOK_POINTS.join(", ")}` },
        { status: 400 }
      );
    }
    const result = await executeHook(hookPoint, {
      // Pinned to the caller's tenant so a hook run cannot fan out across other
      // tenants' plugins.
      tenantId,
      payload: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
      ...(typeof traceId === "string" ? { traceId } : {}),
    });
    // Individual plugin errors are collected rather than thrown, so a run with
    // errors is reported as a partial success, not a clean one.
    return NextResponse.json(
      { action: "execute_hook", result, success: result.errors.length === 0 },
      { status: result.errors.length === 0 ? 200 : 207 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'register_plugin', 'unregister_plugin', 'set_status', 'plugins_for_hook', or 'execute_hook'.`,
    },
    { status: 400 }
  );
}
