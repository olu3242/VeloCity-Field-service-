import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { offerActionSchema, validationError } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);

  const parsed = offerActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const { action, reason } = parsed.data;

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .single();
  if (!provider) return NextResponse.json({ error: "Not a provider" }, { status: 403 });

  const { data: offer } = await supabase
    .from("provider_offers")
    .select("*")
    .eq("id", id)
    .eq("provider_id", provider.id)
    .eq("tenant_id", tenantId)
    .single();
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (offer.accepted_at || offer.rejected_at) {
    return NextResponse.json({ error: "Offer already actioned" }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    await supabase.from("provider_offers").update({ accepted_at: now }).eq("id", id).eq("tenant_id", tenantId);
    await supabase.from("jobs").update({
      status: "accepted",
      provider_id: provider.id,
    }).eq("id", offer.job_id).eq("tenant_id", tenantId);
    await emitEvent(supabase, {
      type: "job_accepted",
      source: "api.offers.action",
      entityType: "job",
      entityId: offer.job_id,
      actorId: user.id,
      tenantId,
      dedupKey: `job_accepted:${offer.job_id}:${provider.id}`,
      payload: {
        job_id: offer.job_id,
        tenant_id: tenantId,
        provider_id: provider.id,
        offer_id: id,
        to_status: "accepted",
        actor_role: "provider",
      },
    });
    await emitEvent(supabase, {
      type: "job_state_changed",
      source: "api.offers.action",
      entityType: "job",
      entityId: offer.job_id,
      actorId: user.id,
      tenantId,
      dedupKey: `job_state_changed:${offer.job_id}:accepted`,
      payload: {
        job_id: offer.job_id,
        tenant_id: tenantId,
        provider_id: provider.id,
        offer_id: id,
        from_status: "offer_sent",
        to_status: "accepted",
        actor_role: "provider",
      },
    });
    // Reject all other pending offers for this job
    await supabase
      .from("provider_offers")
      .update({ rejected_at: now, rejection_reason: "Another provider accepted" })
      .eq("job_id", offer.job_id)
      .eq("tenant_id", tenantId)
      .neq("id", id)
      .is("rejected_at", null);
  } else {
    if (!reason) {
      return NextResponse.json({ error: "Reason required when rejecting an offer" }, { status: 400 });
    }
    await supabase.from("provider_offers").update({
      rejected_at: now,
      rejection_reason: reason ?? null,
    }).eq("id", id).eq("tenant_id", tenantId);
    await emitEvent(supabase, {
      type: "job_reassigned",
      source: "api.offers.action",
      entityType: "job",
      entityId: offer.job_id,
      actorId: user.id,
      tenantId,
      dedupKey: `provider_offer_rejected:${offer.job_id}:${provider.id}`,
      payload: {
        job_id: offer.job_id,
        tenant_id: tenantId,
        provider_id: provider.id,
        offer_id: id,
        reason,
      },
    });
  }

  return NextResponse.json({ success: true });
}
