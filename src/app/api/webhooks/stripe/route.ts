import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/server";
import { calculatePlatformFee } from "@/lib/utils";
import { hasEnvGroup } from "@/lib/env";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!hasEnvGroup("stripe")) {
    return NextResponse.json({ received: true, mode: "stripe-not-configured" });
  }

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const supabase = await createAdminClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const { job_id, payment_type } = intent.metadata;

      await supabase
        .from("payments")
        .update({
          status: "escrowed",
          platform_fee_cents: calculatePlatformFee(intent.amount),
          provider_payout_cents: intent.amount - calculatePlatformFee(intent.amount),
          captured_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", intent.id);

      // Advance job status
      const newStatus = payment_type === "deposit" ? "deposit_paid" : "completed_pending_confirmation";
      await supabase.from("jobs").update({ status: newStatus }).eq("id", job_id);
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("stripe_payment_intent_id", intent.id);
      break;
    }

    case "account.updated": {
      const account = event.data.object;
      await supabase
        .from("providers")
        .update({ stripe_account_status: account.charges_enabled ? "active" : "pending" })
        .eq("stripe_account_id", account.id);
      break;
    }

    case "transfer.created": {
      const transfer = event.data.object;
      await supabase
        .from("payments")
        .update({
          stripe_transfer_id: transfer.id,
          status: "released",
          payout_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", transfer.metadata?.payment_intent_id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
