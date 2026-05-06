import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasEnvGroup } from "@/lib/env";
import { paymentIntentSchema, validationError } from "@/lib/validation";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getTenantId } from "@/lib/tenancy";
import { createVelocityPaymentIntent, calculatePlatformFee } from "@/lib/payments";
import { checkPermission } from "@/lib/access";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paymentIntentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }
  const { job_id, amount_cents, type } = parsed.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, tenant_id")
    .eq("id", user.id)
    .single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "payments", action: "pay_invoice", route: "/api/payments/intent" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const intent = hasEnvGroup("stripe")
    ? await createVelocityPaymentIntent({ amountCents: amount_cents, customerId: user.id, jobId: job_id, type, stripeCustomerId: profile?.stripe_customer_id ?? undefined, tenantId })
    : await createVelocityPaymentIntent({ amountCents: amount_cents, customerId: user.id, jobId: job_id, type, tenantId });
  const platformFeeCents = calculatePlatformFee(amount_cents);

  // Record payment intent in DB
  const { data: payment } = await supabase.from("payments").insert({
    job_id,
    tenant_id: tenantId,
    customer_id: user.id,
    stripe_payment_intent_id: intent.id,
    amount_cents,
    platform_fee_cents: platformFeeCents,
    provider_payout_cents: Math.max(0, amount_cents - platformFeeCents),
    currency: "usd",
    status: "pending",
    type,
    metadata: {},
  }).select("id").single();

  await supabase.from("payment_ledger").insert({
    tenant_id: tenantId,
    job_id,
    customer_id: user.id,
    payment_id: payment?.id,
    amount: amount_cents,
    currency: "usd",
    status: "payment_required",
    entry_type: type,
    metadata: { stripe_payment_intent_id: intent.id, mode: intent.mode },
  });

  await emitEvent(supabase, {
    type: "payment_authorized",
    source: "api.payments.intent",
    entityType: "payment",
    entityId: payment?.id,
    actorId: user.id,
    tenantId,
    dedupKey: `payment_authorized:${intent.id}`,
    payload: {
      job_id,
      tenant_id: tenantId,
      payment_id: payment?.id,
      stripe_payment_intent_id: intent.id,
      amount_cents,
      payment_type: type,
      mode: hasEnvGroup("stripe") ? "stripe" : "local-dev",
    },
  });

  return NextResponse.json({
    client_secret: intent.client_secret,
    mode: hasEnvGroup("stripe") ? "stripe" : "local-dev",
  });
}
