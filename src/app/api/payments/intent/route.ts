import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPaymentIntent } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { job_id, amount_cents, type } = await request.json() as {
    job_id: string;
    amount_cents: number;
    type: "deposit" | "final";
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const intent = await createPaymentIntent(
    amount_cents,
    user.id,
    job_id,
    type,
    profile?.stripe_customer_id ?? undefined
  );

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

  return NextResponse.json({ client_secret: intent.client_secret });
}
