import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quinn } from "@/lib/agents/quinn";
import { createQuoteSchema, validationError } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";
import { calculatePrice, validateQuote } from "@/lib/pricing";
import type { QuoteLineItem, ServiceCategory, UrgencyLevel } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);

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
    .eq("tenant_id", tenantId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Verify provider owns this job
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .single();

  if (!provider || job.provider_id !== provider.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lineItems = body.line_items as QuoteLineItem[];
  const subtotal = lineItems.reduce((sum, li) => sum + li.total_cents, 0);
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;
  const deposit = Math.round(total * 0.3);

  // Service Catalog: use a data-driven pricing profile when one exists for
  // this category/tier, falling back to the hardcoded pricing rules otherwise.
  const tier = job.urgency === "emergency" ? "emergency" : "standard";
  const { data: pricingProfileRow } = await supabase
    .from("service_pricing_profiles")
    .select("base_price_cents, labor_rate_cents, travel_fee_cents, urgency_multiplier, commercial_multiplier")
    .eq("tenant_id", tenantId)
    .eq("category", job.category)
    .eq("tier", tier)
    .eq("is_active", true)
    .maybeSingle();

  const pricingResult = calculatePrice({
    category: job.category as ServiceCategory,
    urgency: job.urgency as UrgencyLevel,
    city: job.city,
    state: job.state,
    zip: job.zip,
    complexity: "moderate",
    materialsEstimateCents: lineItems.filter((item) => item.type === "parts").reduce((sum, item) => sum + item.total_cents, 0),
    quotedAmountCents: total,
    pricingProfile: pricingProfileRow ?? undefined,
  });
  const quoteValidation = validateQuote(total, pricingResult);

  // QUINN reviews the quote for fairness
  const quinnReview = await quinn.reviewQuote(
    lineItems,
    job.category as ServiceCategory,
    job.urgency as UrgencyLevel,
    job.city ?? "",
    job.state ?? "",
    { jobId: body.job_id, tenantId }
  );

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      job_id: body.job_id,
      tenant_id: tenantId,
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

  await supabase.from("pricing_decisions").insert({
    tenant_id: tenantId,
    job_id: body.job_id,
    provider_id: provider.id,
    quote_id: quote.id,
    amount: total,
    currency: "usd",
    status: quoteValidation.status,
    pricing_mode: pricingResult.pricingMode,
    result: { pricingResult, quoteValidation, quinnReview },
    risk_flags: quoteValidation.riskFlags,
    metadata: { source: "api.quotes.create" },
  });

  // Advance job to quote_submitted
  await supabase
    .from("jobs")
    .update({
      status: body.is_change_order ? "change_order_submitted" : "quote_submitted",
      quoted_cost_cents: total,
    })
    .eq("id", body.job_id)
    .eq("tenant_id", tenantId);

  await emitEvent(supabase, {
    type: body.is_change_order ? "change_order_submitted" : "quote_submitted",
    source: "api.quotes.create",
    entityType: "quote",
    entityId: quote.id,
    actorId: user.id,
    tenantId,
    dedupKey: `${body.is_change_order ? "change_order_submitted" : "quote_submitted"}:${quote.id}`,
    payload: {
      job_id: body.job_id,
      tenant_id: tenantId,
      quote_id: quote.id,
      provider_id: provider.id,
      category: job.category,
      urgency: job.urgency,
      amount_cents: total,
      is_change_order: body.is_change_order ?? false,
    },
  });

  await emitEvent(supabase, {
    type: quoteValidation.status === "flagged" || quoteValidation.status === "rejected" ? "quote_flagged" : "quote_validated",
    source: "api.quotes.create",
    entityType: "quote",
    entityId: quote.id,
    actorId: user.id,
    tenantId,
    dedupKey: `quote_validation:${quote.id}`,
    payload: {
      job_id: body.job_id,
      tenant_id: tenantId,
      quote_id: quote.id,
      amount_cents: total,
      status: quoteValidation.status,
      risk_flags: quoteValidation.riskFlags,
    },
  });

  return NextResponse.json({ data: quote, quinn_review: quinnReview, pricing: pricingResult, validation: quoteValidation }, { status: 201 });
}
