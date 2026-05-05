// Handler: payout_queued / payout_released / payout_failed → Stripe payout + retry

import { getAdminClient } from "@/lib/supabase/admin";
import { transferToProvider } from "@/lib/stripe/client";
import { emitEvent } from "../emitEvent";
import type {
  AutomationPayload,
  AutomationQueueItem,
  HandlerResult,
  PayoutQueuedPayload,
} from "@/types/automation";

const MAX_PAYOUT_ATTEMPTS = 3;

export async function handlePayoutRelease(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as PayoutQueuedPayload & Record<string, unknown>;
  const { job_id, provider_id, net_payout_cents } = payload;
  const eventType = item.event_type;

  if (!job_id || !provider_id) return { success: false, error: "Missing job_id or provider_id" };

  const db = getAdminClient();

  if (eventType === "payout_queued") {
    // Just acknowledge — the cron job handles actual release timing
    return { success: true, output: { job_id, status: "queued", release_after: payload.release_after } };
  }

  if (eventType === "payout_released") {
    // Process the actual transfer
    const { data: payout } = await db
      .from("payout_queue")
      .select("*, providers(*)")
      .eq("job_id", job_id)
      .eq("status", "queued")
      .maybeSingle();

    if (!payout) {
      return { success: true, output: { job_id, skipped: "no queued payout found" } };
    }

    const attempts = payout.attempts + 1;

    // Update attempt count
    await db.from("payout_queue").update({ attempts, status: "processing" }).eq("id", payout.id);

    try {
      // Check if Stripe is configured
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const isStripeConfigured = stripeKey && !stripeKey.includes("placeholder");

      if (isStripeConfigured && payout.providers?.stripe_account_id) {
        const transfer = await transferToProvider(
          payout.net_payout_cents,
          payout.providers.stripe_account_id,
          job_id as string,
          "automation_payout"
        );

        await db.from("payout_queue").update({
          status: "released",
          stripe_transfer_id: transfer.id,
          released_at: new Date().toISOString(),
        }).eq("id", payout.id);

        // Update payment record
        await db
          .from("payments")
          .update({ status: "released" })
          .eq("job_id", job_id)
          .in("status", ["captured", "escrowed"]);
      } else {
        // Stripe not configured: log as manual payout needed
        await db.from("payout_queue").update({
          status: "released",
          stripe_transfer_id: "manual_payout",
          released_at: new Date().toISOString(),
        }).eq("id", payout.id);
      }

      // Notify provider
      if (payout.providers?.user_id) {
        await db.from("notifications").insert({
          user_id: payout.providers.user_id,
          type: "payout_sent",
          title: "Payment Sent!",
          body: `$${(payout.net_payout_cents / 100).toFixed(2)} has been transferred to your account.`,
          channel: "in_app",
          metadata: { job_id, net_payout_cents: payout.net_payout_cents },
        });
      }

      await emitEvent("payout_released", { job_id, provider_id, net_payout_cents: payout.net_payout_cents }, `payout_released:${job_id}`);

      return { success: true, output: { job_id, payout_id: payout.id, released: true, net_payout_cents: payout.net_payout_cents } };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await db.from("payout_queue").update({
        status: attempts >= MAX_PAYOUT_ATTEMPTS ? "failed" : "queued",
        error_message: errorMsg,
        attempts,
        release_after: new Date(Date.now() + 5 * 60_000 * attempts).toISOString(), // retry in 5*n min
      }).eq("id", payout.id);

      if (attempts >= MAX_PAYOUT_ATTEMPTS) {
        await emitEvent("payout_failed", { job_id, provider_id, error: errorMsg, attempts } as AutomationPayload, `payout_failed:${job_id}`);
      }

      return { success: false, error: `Payout failed (attempt ${attempts}): ${errorMsg}` };
    }
  }

  if (eventType === "payout_failed") {
    const { data: provider } = await db
      .from("providers")
      .select("user_id")
      .eq("id", provider_id)
      .single();

    if (provider) {
      await db.from("notifications").insert({
        user_id: provider.user_id,
        type: "system_alert",
        title: "Payout Issue",
        body: "We encountered an issue processing your payout. Our team has been notified and will resolve this within 1 business day.",
        channel: "in_app",
        metadata: { job_id },
      });
    }

    return { success: true, output: { job_id, payout_failed: true, admin_alerted: true } };
  }

  return { success: true, output: { job_id, noop: true } };
}
