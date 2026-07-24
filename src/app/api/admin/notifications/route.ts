// GET    /api/admin/notifications — all notifications for a tenant (admin view)
// POST   /api/admin/notifications — broadcast a notification to a user or group
// DELETE /api/admin/notifications?id=... — delete a notification
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { sendNotification } from "@/lib/notifications/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const userId = url.searchParams.get("userId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  const supabase = getAdminClient();

  let query = supabase
    .from("notifications")
    .select("id, user_id, type, title, body, is_read, channel, created_at, job_id, metadata")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);
  if (userId) query = query.eq("user_id", userId);

  const { data: notifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary counts
  const unreadCount = (notifications ?? []).filter((n) => !(n as { is_read: boolean }).is_read).length;
  const channelCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  for (const n of notifications ?? []) {
    const ch = (n as { channel: string | null }).channel ?? "in_app";
    const tp = (n as { type: string | null }).type ?? "unknown";
    channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    typeCounts[tp] = (typeCounts[tp] ?? 0) + 1;
  }

  return NextResponse.json({
    notifications: notifications ?? [],
    summary: {
      total: notifications?.length ?? 0,
      unread: unreadCount,
      channelCounts,
      typeCounts,
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { userId, title, body: msgBody, email, phone, data, markAllRead, userIds } =
    body as Record<string, unknown>;

  // Mark all as read for a tenant
  if (markAllRead === true) {
    const supabase = getAdminClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("tenant_id", tenantId)
      .eq("is_read", false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "mark_all_read" });
  }

  // Broadcast to multiple users
  if (Array.isArray(userIds) && userIds.length > 0) {
    if (typeof title !== "string" || typeof msgBody !== "string") {
      return NextResponse.json({ error: "title and body required for broadcast" }, { status: 400 });
    }

    const supabase = getAdminClient();
    const rows = (userIds as string[]).map((uid) => ({
      user_id: uid,
      tenant_id: tenantId,
      channel: "in_app",
      title,
      body: msgBody,
      data: data ?? {},
      is_read: false,
      sent_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "broadcast", count: rows.length });
  }

  // Send to a single user (with optional email/SMS)
  if (typeof userId !== "string") {
    return NextResponse.json(
      { error: "userId (or userIds array) required" },
      { status: 400 }
    );
  }

  if (typeof title !== "string" || typeof msgBody !== "string") {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  try {
    await sendNotification(supabase, {
      userId,
      tenantId,
      title,
      body: msgBody,
      data: (data as Record<string, unknown>) ?? {},
      email: typeof email === "string" ? email : null,
      phone: typeof phone === "string" ? phone : null,
    });

    return NextResponse.json({ success: true, action: "send", userId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Notification failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getAdminClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
