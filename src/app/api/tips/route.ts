// POST /api/tips — Submit a tip for a completed job
// GET  /api/tips?job_id= — Check existing tip for a job

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { tipSchema, parseBody } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";

const TIP_ALLOWED_STATUSES = ["completed", "customer_confirmed", "closed"];

// ── GET — check if customer already tipped this job ──────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job_id = request.nextUrl.searchParams.get("job_id");
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const { data: tip } = await supabase
    .from("provider_tips")
    .select("id, amount_cents, payment_status, note, created_at")
    .eq("job_id", job_id)
    .eq("customer_id", user.id)
    .maybeSingle();

  return NextResponse.json({ data: tip ?? null });
}

// ── POST — submit a tip ───────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 1. Validate request body ─────────────────────────────
  const body = await request.json();
  const parsed = parseBody(tipSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { job_id, amount_cents, note } = parsed.data;

  // ── 2. Verify job ownership and status ───────────────────
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, provider_id, customer_id")
    .eq("id", job_id)
    .eq("customer_id", user.id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found or access denied" }, { status: 404 });
  }

  const j = job as unknown as { id: string; status: string; provider_id: string | null; customer_id: string };

  if (!TIP_ALLOWED_STATUSES.includes(j.status)) {
    return NextResponse.json(
      { error: `Tips are only allowed on completed jobs. Current status: ${j.status}` },
      { status: 400 }
    );
  }

  if (!j.provider_id) {
    return NextResponse.json({ error: "Job has no assigned provider" }, { status: 400 });
  }

  // ── 3. Check for duplicate tip (idempotency) ─────────────
  const { data: existingTip } = await supabase
    .from("provider_tips")
    .select("id, payment_status")
    .eq("job_id", job_id)
    .eq("customer_id", user.id)
    .maybeSingle();

  const existing = existingTip as unknown as { id: string; payment_status: string } | null;
  if (existing && existing.payment_status === "succeeded") {
    return NextResponse.json(
      { error: "You have already tipped this provider for this job" },
      { status: 409 }
    );
  }

  const idempotencyKey = `tip:${job_id}:${user.id}:${amount_cents}`;
  const isStripeConfigured = Boolean(env.stripe.secretKey);

  let stripePaymentIntentId: string | null = null;
  let paymentStatus: "pending" | "succeeded" | "failed" = "pending";

  // ── 4. Handle Stripe or dev-mode fallback ────────────────
  if (isStripeConfigured) {
    try {
      const { getStripeServer } = await import("@/lib/stripe/client");
      const stripe = getStripeServer();

      // Fetch customer's Stripe ID if available
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single();

      const intent = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: "usd",
        customer: (profile as unknown as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? undefined,
        metadata: {
          job_id,
          customer_id: user.id,
          provider_id: j.provider_id!,
          tip: "true",
          idempotency_key: idempotencyKey,
        },
        description: `VeloCity tip for job ${job_id}`,
        // Tips bypass the platform fee — full amount to provider
      }, { idempotencyKey });

      stripePaymentIntentId = intent.id;

      // Return client_secret for client-side confirmation
      return NextResponse.json({
        data: {
          requires_action: true,
          client_secret: intent.client_secret,
          payment_intent_id: intent.id,
          job_id,
          amount_cents,
        },
      }, { status: 200 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Payment setup failed: ${msg}` }, { status: 500 });
    }
  } else {
    // Dev fallback — simulate immediate success
    stripePaymentIntentId = `pi_simulated_${Date.now()}`;
    paymentStatus = "succeeded";
  }

  // ── 5. Record the tip (dev fallback path reaches here) ────
  return await recordTip({
    job_id,
    customer_id: user.id,
    provider_id: j.provider_id!,
    amount_cents,
    note: note ?? null,
    payment_status: paymentStatus,
    stripe_payment_intent_id: stripePaymentIntentId,
    idempotency_key: idempotencyKey,
    existingTipId: existing?.id ?? null,
  });
}

// ── PATCH /api/tips — confirm after Stripe client-side success
// Called from client after stripe.confirmPayment() resolves
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { payment_intent_id, job_id, amount_cents, note } = await request.json();

  if (!payment_intent_id || !job_id) {
    return NextResponse.json({ error: "payment_intent_id and job_id required" }, { status: 400 });
  }

  // Re-verify job ownership
  const { data: job } = await supabase
    .from("jobs")
    .select("id, provider_id, customer_id")
    .eq("id", job_id)
    .eq("customer_id", user.id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const patchJob = job as unknown as { id: string; provider_id: string | null; customer_id: string };
  const idempotencyKey = `tip:${job_id}:${user.id}:${amount_cents}`;

  return await recordTip({
    job_id,
    customer_id: user.id,
    provider_id: patchJob.provider_id ?? "",
    amount_cents,
    note: note ?? null,
    payment_status: "succeeded",
    stripe_payment_intent_id: payment_intent_id,
    idempotency_key: idempotencyKey,
    existingTipId: null,
  });
}

// ── Shared tip record creation ───────────────────────────────
async function recordTip(params: {
  job_id: string;
  customer_id: string;
  provider_id: string;
  amount_cents: number;
  note: string | null;
  payment_status: "pending" | "succeeded" | "failed";
  stripe_payment_intent_id: string | null;
  idempotency_key: string;
  existingTipId: string | null;
}): Promise<NextResponse> {
  const db = getAdminClient();
  const {
    job_id, customer_id, provider_id, amount_cents, note,
    payment_status, stripe_payment_intent_id, idempotency_key, existingTipId,
  } = params;

  let tip;

  if (existingTipId) {
    // Update failed/pending tip to succeeded
    const { data, error } = await db
      .from("provider_tips")
      .update({ payment_status, stripe_payment_intent_id, note })
      .eq("id", existingTipId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    tip = data;
  } else {
    const { data, error } = await db
      .from("provider_tips")
      .insert({
        job_id, customer_id, provider_id, amount_cents, note,
        payment_status, stripe_payment_intent_id, idempotency_key,
      })
      .select()
      .single();
    if (error) {
      // Unique constraint violation = duplicate tip attempt
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "You have already tipped this provider for this job" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    tip = data;
  }

  // ── Emit automation event (non-blocking) ─────────────────
  if (payment_status === "succeeded") {
    emitEvent(
      "tip_submitted",
      {
        tip_id:      tip.id,
        job_id,
        provider_id,
        customer_id,
        amount_cents,
        note,
      },
      `tip_submitted:${tip.id}`
    ).catch(() => {/* non-blocking */});
  }

  return NextResponse.json({ data: tip }, { status: 201 });
}
