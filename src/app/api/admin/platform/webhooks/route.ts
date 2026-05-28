import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

function hashSecret(value: string) {
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

  const db = getAdminClient();
  const [{ data: subscriptions, error }, { data: deliveries }] = await Promise.all([
    db.from("webhook_subscriptions")
      .select("id, url, events, status, failure_count, last_delivery_at, created_at")
      .eq("tenant_id", admin.tenantId)
      .order("created_at", { ascending: false }),
    db.from("webhook_deliveries")
      .select("id, subscription_id, event_type, status, attempt_count, response_status, error_message, created_at")
      .eq("tenant_id", admin.tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: { subscriptions, deliveries: deliveries ?? [] } });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const events = Array.isArray(body?.events) ? body.events.filter((event): event is string => typeof event === "string") : [];
  if (!url || !events.length) return NextResponse.json({ success: false, error: "url and events required" }, { status: 400 });

  const signingSecret = `whsec_${randomBytes(24).toString("hex")}`;
  const { data, error } = await getAdminClient()
    .from("webhook_subscriptions")
    .insert({
      tenant_id: admin.tenantId,
      url,
      events,
      signing_secret: signingSecret,
      secret_hash: hashSecret(signingSecret),
      status: "active",
    })
    .select("id, url, events, status, created_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await getAdminClient().from("audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_id: admin.user.id,
    actor_role: "admin",
    action: "webhook_subscription.created",
    entity_type: "webhook_subscription",
    entity_id: data.id,
    metadata: { url, events },
  }).then(() => null);

  return NextResponse.json({ success: true, data: { ...data, signing_secret: signingSecret } }, { status: 201 });
}
