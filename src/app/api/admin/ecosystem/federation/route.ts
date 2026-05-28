import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { federateEvent } from "@/runtime/ecosystem/federation";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await getAdminClient()
    .from("federation_events")
    .select("*")
    .eq("tenant_id", admin.tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.event_type !== "string") {
    return NextResponse.json({ success: false, error: "event_type required" }, { status: 400 });
  }

  try {
    const data = await federateEvent({
      tenantId: admin.tenantId,
      participantId: typeof body.participant_id === "string" ? body.participant_id : undefined,
      eventType: body.event_type,
      direction: body.direction === "outbound" ? "outbound" : "inbound",
      payload: typeof body.payload === "object" && body.payload !== null ? body.payload as Record<string, unknown> : {},
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Federation failed" }, { status: 500 });
  }
}
