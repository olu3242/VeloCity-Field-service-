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

  const { action, reason } = await request.json() as { action: "accept" | "reject"; reason?: string };

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!provider) return NextResponse.json({ error: "Not a provider" }, { status: 403 });

  const { data: offer } = await supabase
    .from("provider_offers")
    .select("*")
    .eq("id", id)
    .eq("provider_id", provider.id)
    .single();
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (offer.accepted_at || offer.rejected_at) {
    return NextResponse.json({ error: "Offer already actioned" }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    await supabase.from("provider_offers").update({ accepted_at: now }).eq("id", id);
    await supabase.from("jobs").update({
      status: "accepted",
      provider_id: provider.id,
    }).eq("id", offer.job_id);
    // Reject all other pending offers for this job
    await supabase
      .from("provider_offers")
      .update({ rejected_at: now, rejection_reason: "Another provider accepted" })
      .eq("job_id", offer.job_id)
      .neq("id", id)
      .is("rejected_at", null);
  } else {
    await supabase.from("provider_offers").update({
      rejected_at: now,
      rejection_reason: reason ?? null,
    }).eq("id", id);
  }

  return NextResponse.json({ success: true });
}
