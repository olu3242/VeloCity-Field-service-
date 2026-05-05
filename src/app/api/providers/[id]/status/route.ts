import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // Allow admins to approve/reject/suspend; providers to toggle online
  const { action, reason } = await request.json() as {
    action: "approve" | "reject" | "suspend" | "toggle_online";
    reason?: string;
  };

  if (action === "toggle_online") {
    const { data: provider } = await supabase.from("providers").select("is_online, user_id").eq("id", id).single();
    if (!provider || provider.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase.from("providers").update({ is_online: !provider.is_online }).eq("id", id);
    return NextResponse.json({ is_online: !provider.is_online });
  }

  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const statusMap: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
    suspend: "suspended",
  };

  const updates: Record<string, unknown> = { status: statusMap[action] };
  if (action === "approve") updates.approved_at = new Date().toISOString();
  if (reason) updates.admin_notes = reason;

  const { data, error } = await supabase.from("providers").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
