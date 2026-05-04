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

  const { action, reason } = await request.json() as { action: "approve" | "reject"; reason?: string };

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, jobs(*)")
    .eq("id", id)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const job = quote.jobs as Record<string, unknown>;
  if (job.customer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    await supabase.from("quotes").update({ approved_at: now }).eq("id", id);
    await supabase.from("jobs").update({
      status: quote.is_change_order ? "change_order_approved" : "quote_approved",
      quoted_cost_cents: quote.total_cents,
    }).eq("id", quote.job_id);
  } else {
    await supabase.from("quotes").update({ rejected_at: now }).eq("id", id);
    await supabase.from("jobs").update({
      status: quote.is_change_order ? "in_progress" : "cancelled",
      customer_notes: reason ?? null,
    }).eq("id", quote.job_id);
  }

  return NextResponse.json({ success: true });
}
