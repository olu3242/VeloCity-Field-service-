import { NextRequest, NextResponse } from "next/server";
import { velocityBrand } from "@/config/brand";
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
    .from("tenant_branding")
    .select("display_name, primary_color, accent_color, logo_url, custom_domain, theme, white_label_enabled, updated_at")
    .eq("tenant_id", admin.tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? {
    display_name: velocityBrand.productName,
    primary_color: velocityBrand.colors.volt,
    accent_color: velocityBrand.colors.amber,
    theme: {},
    white_label_enabled: false,
  } });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });

  const payload = {
    tenant_id: admin.tenantId,
    display_name: typeof body.display_name === "string" ? body.display_name : velocityBrand.productName,
    primary_color: typeof body.primary_color === "string" ? body.primary_color : velocityBrand.colors.volt,
    accent_color: typeof body.accent_color === "string" ? body.accent_color : velocityBrand.colors.amber,
    logo_url: typeof body.logo_url === "string" ? body.logo_url : null,
    custom_domain: typeof body.custom_domain === "string" ? body.custom_domain : null,
    theme: typeof body.theme === "object" && body.theme !== null ? body.theme : {},
    white_label_enabled: Boolean(body.white_label_enabled),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getAdminClient()
    .from("tenant_branding")
    .upsert(payload, { onConflict: "tenant_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminClient().from("audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_id: admin.user.id,
    actor_role: "admin",
    action: "tenant_branding.updated",
    entity_type: "tenant_branding",
    entity_id: data.id,
    metadata: { custom_domain: payload.custom_domain, white_label_enabled: payload.white_label_enabled },
  }).then(() => null);

  return NextResponse.json({ success: true, data });
}
