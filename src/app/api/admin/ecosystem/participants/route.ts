import { NextRequest, NextResponse } from "next/server";
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
    .from("ecosystem_participants")
    .select("*")
    .eq("tenant_id", admin.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string" || typeof body.participant_type !== "string") {
    return NextResponse.json({ success: false, error: "name and participant_type required" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("ecosystem_participants")
    .insert({
      tenant_id: admin.tenantId,
      name: body.name,
      participant_type: body.participant_type,
      endpoint_url: typeof body.endpoint_url === "string" ? body.endpoint_url : null,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((item): item is string => typeof item === "string") : [],
      governance_policy: typeof body.governance_policy === "object" && body.governance_policy !== null ? body.governance_policy : {},
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminClient().from("audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_id: admin.user.id,
    actor_role: "admin",
    action: "ecosystem_participant.created",
    entity_type: "ecosystem_participant",
    entity_id: data.id,
    metadata: { name: body.name, participant_type: body.participant_type },
  }).then(() => null);

  return NextResponse.json({ success: true, data }, { status: 201 });
}
