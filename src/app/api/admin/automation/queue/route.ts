import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import { processAutomationQueue } from "@/lib/automation/worker";

async function assertAutomationAdmin(route: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "automation_queue", action: "retry_automation", route });
  if (!access.allowed) return null;
  return { user, tenantId };
}

export async function GET(request: NextRequest) {
  const auth = await assertAutomationAdmin("/api/admin/automation/queue");
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();
  const status = request.nextUrl.searchParams.get("status") ?? "failed";
  const [{ data: queue }, { data: deadLetters }] = await Promise.all([
    db.from("automation_queue")
      .select("id,event_type,status,retry_count,error_message,created_at,available_at,processed_at,correlation_id")
      .eq("tenant_id", auth.tenantId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("automation_dead_letters")
      .select("id,queue_id,event_type,status,retry_count,error_message,created_at,correlation_id")
      .eq("tenant_id", auth.tenantId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({ success: true, data: { queue: queue ?? [], dead_letters: deadLetters ?? [] } });
}

export async function POST(request: NextRequest) {
  const auth = await assertAutomationAdmin("/api/admin/automation/queue");
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as { action?: string; queue_id?: string; dead_letter_id?: string; limit?: number } | null;
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const db = getAdminClient();

  if (body.action === "process") {
    const result = await processAutomationQueue(db, Math.min(body.limit ?? 25, 100), auth.tenantId);
    return NextResponse.json({ success: true, data: result });
  }

  if (body.action === "retry_queue") {
    if (!body.queue_id) return NextResponse.json({ error: "queue_id required" }, { status: 400 });
    const { error } = await db.from("automation_queue").update({
      status: "pending",
      retry_count: 0,
      error_message: null,
      available_at: new Date().toISOString(),
      processed_at: null,
    }).eq("id", body.queue_id).eq("tenant_id", auth.tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "replay_dead_letter") {
    if (!body.dead_letter_id) return NextResponse.json({ error: "dead_letter_id required" }, { status: 400 });
    const { data: deadLetter } = await db
      .from("automation_dead_letters")
      .select("*")
      .eq("id", body.dead_letter_id)
      .eq("tenant_id", auth.tenantId)
      .single();
    if (!deadLetter) return NextResponse.json({ error: "dead letter not found" }, { status: 404 });
    const item = deadLetter as {
      id: string;
      event_id: string | null;
      event_type: string;
      tenant_id: string | null;
      payload: Record<string, unknown>;
      correlation_id: string | null;
    };
    const { error: insertError } = await db.from("automation_queue").insert({
      event_id: item.event_id,
      event_type: item.event_type,
      tenant_id: item.tenant_id,
      payload: { ...(item.payload ?? {}), correlation_id: item.correlation_id },
      correlation_id: item.correlation_id,
      status: "pending",
      retry_count: 0,
      available_at: new Date().toISOString(),
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    await db.from("automation_dead_letters").update({
      status: "replayed",
      replayed_at: new Date().toISOString(),
      replayed_by: auth.user.id,
    }).eq("id", item.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "close_dead_letter") {
    if (!body.dead_letter_id) return NextResponse.json({ error: "dead_letter_id required" }, { status: 400 });
    const { error } = await db.from("automation_dead_letters").update({ status: "closed" }).eq("id", body.dead_letter_id).eq("tenant_id", auth.tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
}
