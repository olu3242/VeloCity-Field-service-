import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { calculatePlatformFee } from "@/lib/utils";
import { hasEnvGroup } from "@/lib/env";
import { emitEvent } from "@/lib/automation/emitEvent";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { generateReceipt } from "@/lib/finance/generateReceipt";

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

  switch (event.type as string) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as any;
      const tenantId = intent.metadata?.tenant_id ?? DEFAULT_TENANT_ID;

      // Handle tip payments separately
      if (intent.metadata?.tip === "true") {
        const db = getAdminClient();
        await db.from("provider_tips")
          .update({ payment_status: "succeeded" })
          .eq("stripe_payment_intent_id", intent.id)
          .eq("payment_status", "pending");

        const { data: tipRecord } = await db.from("provider_tips")
          .select("id, provider_id, amount_cents, job_id")
          .eq("stripe_payment_intent_id", intent.id)
          .single();

        if (tipRecord) {
          await emitEvent(supabase, {
            type: "tip_submitted",
            tenantId,
            source: "api.webhooks.stripe",
            entityType: "tip",
            entityId: tipRecord.id,
            dedupKey: `tip_succeeded:${intent.id}`,
            payload: {
              tip_id: tipRecord.id,
              provider_id: tipRecord.provider_id,
              amount_cents: tipRecord.amount_cents,
              job_id: tipRecord.job_id,
              stripe_payment_intent_id: intent.id,
              tenant_id: tenantId,
            },
          });
        }
        break;
      }

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
      await emitEvent(supabase, {
        type: "payment_authorized",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "payment",
        actorId: undefined,
        dedupKey: `stripe_payment_authorized:${intent.id}`,
        payload: {
          job_id,
          tenant_id: tenantId,
          stripe_payment_intent_id: intent.id,
          amount_cents: intent.amount,
          payment_type,
          to_status: newStatus,
        },
      });
      if (newStatus === "completed_pending_confirmation") {
        await emitEvent(supabase, {
          type: "job_completed",
          tenantId,
          source: "api.webhooks.stripe",
          entityType: "job",
          entityId: job_id,
          dedupKey: `job_completed:${job_id}:${intent.id}`,
          payload: { job_id, tenant_id: tenantId, payment_type, to_status: newStatus },
        });
      }
      await supabase.from("payment_ledger").insert({
        tenant_id: tenantId,
        job_id,
        amount: intent.amount,
        currency: intent.currency ?? "usd",
        status: "paid",
        entry_type: payment_type ?? "payment",
        metadata: { stripe_payment_intent_id: intent.id, webhook: event.type },
      });
      const { data: jobForReceipt } = await supabase.from("jobs").select("customer_id,provider_id").eq("id", job_id).eq("tenant_id", tenantId).maybeSingle();
      if (jobForReceipt?.customer_id) {
        const { data: receipt } = await generateReceipt({
          supabase,
          tenantId,
          jobId: job_id,
          customerId: jobForReceipt.customer_id,
          providerId: jobForReceipt.provider_id,
          amount: intent.amount,
          breakdown: {
            stripe_payment_intent_id: intent.id,
            payment_type,
            platform_fee_cents: calculatePlatformFee(intent.amount),
            provider_payout_cents: intent.amount - calculatePlatformFee(intent.amount),
          },
        });
        if (receipt?.id) await supabase.from("jobs").update({ receipt_id: receipt.id }).eq("id", job_id).eq("tenant_id", tenantId);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as any;
      const tenantId = intent.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("stripe_payment_intent_id", intent.id);
      await emitEvent(supabase, {
        type: "payment_failed",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "payment",
        dedupKey: `stripe_payment_failed:${intent.id}`,
        payload: {
          stripe_payment_intent_id: intent.id,
          tenant_id: tenantId,
          amount_cents: intent.amount,
          job_id: intent.metadata?.job_id,
        },
      });
      await supabase.from("payment_retries").insert({
        tenant_id: tenantId,
        job_id: intent.metadata?.job_id ?? null,
        customer_id: intent.metadata?.customer_id ?? null,
        amount: intent.amount,
        currency: intent.currency ?? "usd",
        status: "scheduled",
        retry_count: 0,
        next_retry_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        metadata: { stripe_payment_intent_id: intent.id },
      });
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as any;
      const tenantId = charge.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await supabase.from("refund_records").insert({
        tenant_id: tenantId,
        job_id: charge.metadata?.job_id ?? null,
        customer_id: charge.metadata?.customer_id ?? null,
        amount: charge.amount_refunded ?? 0,
        currency: charge.currency ?? "usd",
        status: "refunded",
        reason: "stripe_refund",
        metadata: { stripe_charge_id: charge.id, webhook: event.type },
      });
      await emitEvent(supabase, {
        type: "refund_issued",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "refund",
        dedupKey: `charge_refunded:${charge.id}`,
        payload: { tenant_id: tenantId, stripe_charge_id: charge.id, amount_cents: charge.amount_refunded ?? 0 },
      });
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as any;
      const tenantId = dispute.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await emitEvent(supabase, {
        type: "chargeback_opened",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "dispute",
        dedupKey: `chargeback_opened:${dispute.id}`,
        payload: { tenant_id: tenantId, stripe_dispute_id: dispute.id, amount_cents: dispute.amount },
      });
      break;
    }

    case "account.updated": {
      const account = event.data.object as any;
      await supabase
        .from("providers")
        .update({ stripe_account_status: account.charges_enabled ? "active" : "pending" })
        .eq("stripe_account_id", account.id);
      break;
    }

    case "transfer.created": {
      const transfer = event.data.object as any;
      const tenantId = transfer.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await supabase
        .from("payments")
        .update({
          stripe_transfer_id: transfer.id,
          status: "released",
          payout_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", transfer.metadata?.payment_intent_id);
      await emitEvent(supabase, {
        type: "payout_released",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "payment",
        dedupKey: `transfer_created:${transfer.id}`,
        payload: {
          stripe_transfer_id: transfer.id,
          tenant_id: tenantId,
          stripe_payment_intent_id: transfer.metadata?.payment_intent_id,
          amount_cents: transfer.amount,
        },
      });
      break;
    }

    case "transfer.failed": {
      const transfer = event.data.object as any;
      const tenantId = transfer.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await emitEvent(supabase, {
        type: "payout_failed",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "payment",
        dedupKey: `transfer_failed:${transfer.id}`,
        payload: { tenant_id: tenantId, stripe_transfer_id: transfer.id, amount_cents: transfer.amount },
      });
      break;
    }

    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      const tenantId = invoice.metadata?.tenant_id ?? DEFAULT_TENANT_ID;
      await supabase.from("subscription_events").insert({
        tenant_id: tenantId,
        customer_id: invoice.metadata?.customer_id ?? null,
        subscription_id: typeof invoice.subscription === "string" ? invoice.subscription : null,
        amount: invoice.amount_paid ?? invoice.amount_due ?? 0,
        currency: invoice.currency ?? "usd",
        status: event.type === "invoice.payment_succeeded" ? "paid" : "payment_failed",
        event_type: event.type,
        metadata: { stripe_invoice_id: invoice.id },
      });
      await emitEvent(supabase, {
        type: event.type === "invoice.payment_succeeded" ? "payment_authorized" : "payment_failed",
        tenantId,
        source: "api.webhooks.stripe",
        entityType: "subscription",
        dedupKey: `${event.type}:${invoice.id}`,
        payload: { tenant_id: tenantId, stripe_invoice_id: invoice.id, amount_cents: invoice.amount_paid ?? invoice.amount_due ?? 0 },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
