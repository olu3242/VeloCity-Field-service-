import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPaymentIntent } from "@/lib/stripe/client";
import { hasEnvGroup } from "@/lib/env";
import { paymentIntentSchema, validationError } from "@/lib/validation";

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
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const intent = hasEnvGroup("stripe")
    ? await createPaymentIntent(
        amount_cents,
        user.id,
        job_id,
        type,
        profile?.stripe_customer_id ?? undefined
      )
    : {
        id: `local_pi_${crypto.randomUUID()}`,
        client_secret: `local_secret_${crypto.randomUUID()}`,
      };

  // Record payment intent in DB
  await supabase.from("payments").insert({
    job_id,
    customer_id: user.id,
    stripe_payment_intent_id: intent.id,
    amount_cents,
    platform_fee_cents: 0,
    provider_payout_cents: 0,
    currency: "usd",
    status: "pending",
    type,
    metadata: {},
  });

  return NextResponse.json({
    client_secret: intent.client_secret,
    mode: hasEnvGroup("stripe") ? "stripe" : "local-dev",
  });
}
