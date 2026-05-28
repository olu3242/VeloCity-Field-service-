import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

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
    .from("platform_api_keys")
    .select("id, name, scopes, status, last_used_at, created_at")
    .eq("tenant_id", admin.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scopes = Array.isArray(body?.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string") : ["events:write"];
  if (!name) return NextResponse.json({ success: false, error: "name required" }, { status: 400 });

  const rawKey = `vel_${randomBytes(24).toString("hex")}`;
  const { data, error } = await getAdminClient()
    .from("platform_api_keys")
    .insert({
      tenant_id: admin.tenantId,
      name,
      key_hash: hashKey(rawKey),
      scopes,
      status: "active",
    })
    .select("id, name, scopes, status, created_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminClient().from("audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_id: admin.user.id,
    actor_role: "admin",
    action: "platform_api_key.created",
    entity_type: "platform_api_key",
    entity_id: data.id,
    metadata: { name, scopes },
  }).then(() => null);

  return NextResponse.json({ success: true, data: { ...data, key: rawKey } }, { status: 201 });
}
