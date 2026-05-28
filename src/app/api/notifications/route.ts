import { NextRequest } from "next/server";
import { fail, ok, serverError, unauthorized } from "@/lib/api/response";
import { listNotifications } from "@/lib/repositories/notifications";
import { createClient } from "@/lib/supabase/server";

// GET /api/notifications?limit=N
// Returns notifications for the current user, newest first.
// Maps DB column is_read → read for the NotificationBell component.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  const { data: notifications, error } = await listNotifications(supabase, user.id, limit);
  if (error) return serverError(error.message);

  return ok(notifications);
}

// PATCH /api/notifications
// Body: { mark_all_read: true } OR { id: "notification-uuid" }
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { mark_all_read, mark_all, id, ids } = body as {
    mark_all_read?: boolean;
    mark_all?: boolean; // legacy alias
    id?: string;
    ids?: string[];
  };

  const shouldMarkAll = mark_all_read === true || mark_all === true;

  if (shouldMarkAll) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (error) return serverError(error.message);
  } else if (id) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return serverError(error.message);
  } else if (ids?.length) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", ids)
      .eq("user_id", user.id);
    if (error) return serverError(error.message);
  } else {
    return fail("id, ids, or mark_all_read is required");
  }

  return ok({ updated: true });
}
