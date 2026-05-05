import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quinn } from "@/lib/agents/quinn";
import { createQuoteSchema, validationError } from "@/lib/validation";
import type { QuoteLineItem, ServiceCategory, UrgencyLevel } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createQuoteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const body = parsed.data;

  // Get job for context
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", body.job_id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Verify provider owns this job
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider || job.provider_id !== provider.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lineItems = body.line_items as QuoteLineItem[];
  const subtotal = lineItems.reduce((sum, li) => sum + li.total_cents, 0);
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;
  const deposit = Math.round(total * 0.3);

  // QUINN reviews the quote for fairness
  const quinnReview = await quinn.reviewQuote(
    lineItems,
    job.category as ServiceCategory,
    job.urgency as UrgencyLevel,
    job.city ?? "",
    job.state ?? "",
    { jobId: body.job_id }
  );

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      job_id: body.job_id,
      provider_id: provider.id,
      is_change_order: body.is_change_order ?? false,
      parent_quote_id: body.parent_quote_id ?? null,
      line_items: lineItems,
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: total,
      deposit_required_cents: deposit,
      notes: body.notes ?? null,
      valid_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Advance job to quote_submitted
  await supabase
    .from("jobs")
    .update({
      status: body.is_change_order ? "change_order_submitted" : "quote_submitted",
      quoted_cost_cents: total,
    })
    .eq("id", body.job_id);

  return NextResponse.json({ data: quote, quinn_review: quinnReview }, { status: 201 });
}
