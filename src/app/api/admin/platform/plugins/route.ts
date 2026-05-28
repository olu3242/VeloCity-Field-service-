import { NextRequest, NextResponse } from "next/server";
import { PLUGIN_REGISTRY } from "@/lib/plugins/registry";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { user, tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await getAdminClient()
    .from("plugin_installations")
    .select("*")
    .eq("tenant_id", admin.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data: {
      registry: Array.from(PLUGIN_REGISTRY.values()),
      installations: data ?? [],
    },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const pluginId = typeof body?.plugin_id === "string" ? body.plugin_id : "";
  const plugin = PLUGIN_REGISTRY.get(pluginId);
  if (!plugin) return NextResponse.json({ success: false, error: "Unknown plugin" }, { status: 404 });

  const permissions = Array.isArray(body?.permissions)
    ? body.permissions.filter((permission): permission is string => typeof permission === "string")
    : plugin.hooks.map((hook) => `hook:${hook.event}`);

  const { data, error } = await getAdminClient()
    .from("plugin_installations")
    .upsert({
      tenant_id: admin.tenantId,
      plugin_id: plugin.id,
      plugin_type: plugin.type,
      version: plugin.version,
      status: typeof body?.status === "string" ? body.status : "active",
      permissions,
      config: typeof body?.config === "object" && body.config !== null ? body.config : {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,plugin_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminClient().from("audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_id: admin.user.id,
    actor_role: "admin",
    action: "plugin.installation.upserted",
    entity_type: "plugin_installation",
    entity_id: data.id,
    metadata: { plugin_id: plugin.id, permissions },
  }).then(() => null);

  return NextResponse.json({ success: true, data });
}
