import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/notifications?limit=N
// Returns notifications for the current user, newest first.
// Maps DB column is_read → read for the NotificationBell component.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, is_read, created_at, job_id, metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map is_read → read for the NotificationBell component
  const notifications = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    read: n.is_read ?? false,
    created_at: n.created_at,
    job_id: n.job_id ?? undefined,
    metadata: n.metadata ?? undefined,
  }));

  return NextResponse.json({ data: notifications });
}

// PATCH /api/notifications
// Body: { mark_all_read: true } OR { id: "notification-uuid" }
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { mark_all_read, mark_all, id, ids } = body as {
    mark_all_read?: boolean;
    mark_all?: boolean; // legacy alias
    id?: string;
    ids?: string[];
  };

  const shouldMarkAll = mark_all_read === true || mark_all === true;

  if (shouldMarkAll) {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);
  } else if (id) {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
  } else if (ids?.length) {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", ids)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ success: true });
}
