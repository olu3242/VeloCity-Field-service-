import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quoteActionSchema, validationError } from "@/lib/validation";
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

  const parsed = quoteActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const { action, reason } = parsed.data;

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, jobs(*)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const job = quote.jobs as Record<string, unknown>;
  if (job.customer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    await supabase.from("quotes").update({ approved_at: now }).eq("id", id).eq("tenant_id", tenantId);
    await supabase.from("jobs").update({
      status: quote.is_change_order ? "change_order_approved" : "quote_approved",
      quoted_cost_cents: quote.total_cents,
    }).eq("id", quote.job_id).eq("tenant_id", tenantId);
    await emitEvent(supabase, {
      type: "quote_approved",
      source: "api.quotes.action",
      entityType: "quote",
      entityId: id,
      actorId: user.id,
      tenantId,
      dedupKey: `quote_approved:${id}`,
      payload: {
        job_id: quote.job_id,
        tenant_id: tenantId,
        quote_id: id,
        amount_cents: quote.total_cents,
        is_change_order: quote.is_change_order,
      },
    });
  } else {
    if (!reason) {
      return NextResponse.json({ error: "Reason required when rejecting a quote" }, { status: 400 });
    }
    await supabase.from("quotes").update({ rejected_at: now }).eq("id", id).eq("tenant_id", tenantId);
    await supabase.from("jobs").update({
      status: quote.is_change_order ? "in_progress" : "cancelled",
      customer_notes: reason ?? null,
    }).eq("id", quote.job_id).eq("tenant_id", tenantId);
    await emitEvent(supabase, {
      type: "quote_rejected",
      source: "api.quotes.action",
      entityType: "quote",
      entityId: id,
      actorId: user.id,
      tenantId,
      dedupKey: `quote_rejected:${id}`,
      payload: {
        job_id: quote.job_id,
        tenant_id: tenantId,
        quote_id: id,
        amount_cents: quote.total_cents,
        is_change_order: quote.is_change_order,
        reason,
      },
    });
  }

  return NextResponse.json({ success: true });
}
