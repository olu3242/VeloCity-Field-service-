// Membership Lifecycle — the only code path permitted to write
// membership_subscriptions/membership_usage/membership_events (Rule 3: every
// recurring dollar traces Customer → Membership → Service Entitlement →
// Booking → Revenue Record). Reuses the existing automation event emitter
// (src/lib/automation/emitEvent.ts) — no new automation engine, per Rule 1.

import { getAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/automation/emitEvent";

const PERIOD_DAYS: Record<"monthly" | "quarterly" | "annual", number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

export interface CreateMembershipSubscriptionInput {
  customerId: string;
  planId: string;
  planPricingId: string;
  billingFrequency: "monthly" | "quarterly" | "annual";
  amountCents: number;
  stripeSubscriptionId?: string | null;
}

export async function createMembershipSubscription(input: CreateMembershipSubscriptionInput) {
  const db = getAdminClient();
  const now = new Date();
  const periodEnd = new Date(now.getTime() + PERIOD_DAYS[input.billingFrequency] * 24 * 60 * 60 * 1000);

  const { data: subscription, error } = await db
    .from("membership_subscriptions")
    .insert({
      customer_id: input.customerId,
      plan_id: input.planId,
      plan_pricing_id: input.planPricingId,
      billing_frequency: input.billingFrequency,
      amount_cents: input.amountCents,
      status: "active",
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_service_date: periodEnd.toISOString().slice(0, 10),
      started_at: now.toISOString(),
    })
    .select("id, customer_id, plan_id, billing_frequency, amount_cents, current_period_end")
    .single();

  if (error || !subscription) {
    throw new Error(error?.message ?? "Failed to create membership subscription");
  }

  await db.from("membership_events").insert({
    subscription_id: subscription.id,
    event_type: "membership_created",
    detail: { plan_id: input.planId, billing_frequency: input.billingFrequency, amount_cents: input.amountCents },
  });

  await emitEvent("membership_created", {
    membership_subscription_id: subscription.id,
    customer_id: subscription.customer_id,
    plan_id: subscription.plan_id,
  });

  return subscription;
}

export async function renewMembershipSubscription(subscriptionId: string) {
  const db = getAdminClient();
  const { data: subscription } = await db
    .from("membership_subscriptions")
    .select("id, customer_id, plan_id, billing_frequency, amount_cents, status")
    .eq("id", subscriptionId)
    .single();

  if (!subscription || subscription.status === "cancelled") {
    throw new Error("Cannot renew a cancelled or missing membership subscription");
  }

  const now = new Date();
  const periodEnd = new Date(
    now.getTime() + PERIOD_DAYS[subscription.billing_frequency as "monthly" | "quarterly" | "annual"] * 24 * 60 * 60 * 1000
  );

  await db
    .from("membership_subscriptions")
    .update({
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_service_date: periodEnd.toISOString().slice(0, 10),
      renewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", subscriptionId);

  await db.from("membership_events").insert({
    subscription_id: subscriptionId,
    event_type: "membership_renewed",
    detail: { renewed_at: now.toISOString(), new_period_end: periodEnd.toISOString() },
  });

  await emitEvent("membership_renewed", {
    membership_subscription_id: subscriptionId,
    customer_id: subscription.customer_id,
    plan_id: subscription.plan_id,
  });
}

export async function flagRenewalFailed(subscriptionId: string, reason: string) {
  const db = getAdminClient();
  await db
    .from("membership_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);

  await db.from("membership_events").insert({
    subscription_id: subscriptionId,
    event_type: "renewal_failed",
    detail: { reason },
  });

  const { data: subscription } = await db
    .from("membership_subscriptions")
    .select("customer_id, plan_id")
    .eq("id", subscriptionId)
    .single();

  await emitEvent("renewal_failed", {
    membership_subscription_id: subscriptionId,
    customer_id: subscription?.customer_id,
    plan_id: subscription?.plan_id,
    reason,
  });
}

export async function cancelMembershipSubscription(subscriptionId: string, reason: string) {
  const db = getAdminClient();
  const now = new Date().toISOString();

  const { data: subscription } = await db
    .from("membership_subscriptions")
    .update({ status: "cancelled", cancelled_at: now, cancellation_reason: reason, updated_at: now })
    .eq("id", subscriptionId)
    .select("id, customer_id, plan_id")
    .single();

  await db.from("membership_events").insert({
    subscription_id: subscriptionId,
    event_type: "membership_cancelled",
    detail: { reason },
  });

  await emitEvent("membership_cancelled", {
    membership_subscription_id: subscriptionId,
    customer_id: subscription?.customer_id,
    plan_id: subscription?.plan_id,
    reason,
  });
}

/**
 * Records consumption of an entitlement against a real completed job, and
 * links the job + the revenue record produced for that job back to the
 * membership subscription, per Rule 3's required traceability chain.
 */
export async function recordMembershipUsage(input: {
  subscriptionId: string;
  entitlementId: string;
  jobId: string;
}) {
  const db = getAdminClient();
  const { data: subscription } = await db
    .from("membership_subscriptions")
    .select("current_period_start, current_period_end")
    .eq("id", input.subscriptionId)
    .single();
  if (!subscription) throw new Error("Membership subscription not found");

  await db.from("membership_usage").insert({
    subscription_id: input.subscriptionId,
    entitlement_id: input.entitlementId,
    job_id: input.jobId,
    period_start: subscription.current_period_start,
    period_end: subscription.current_period_end,
  });

  await db.from("jobs").update({ membership_subscription_id: input.subscriptionId }).eq("id", input.jobId);
  await db
    .from("revenue_records")
    .update({ membership_subscription_id: input.subscriptionId })
    .eq("job_id", input.jobId);
}

/** Emits `subscription_due` (the existing, previously-dead automation
 * event) for memberships whose next_service_date has arrived — the single
 * activation point that turns that dead router branch into a real one. */
export async function emitDueMembershipServices(): Promise<number> {
  const db = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: due } = await db
    .from("membership_subscriptions")
    .select("id, customer_id, plan_id, next_service_date")
    .eq("status", "active")
    .lte("next_service_date", today);

  for (const row of due ?? []) {
    await db.from("membership_events").insert({
      subscription_id: row.id,
      event_type: "service_due",
      detail: { next_service_date: row.next_service_date },
    });
    await emitEvent("subscription_due", {
      membership_subscription_id: row.id,
      customer_id: row.customer_id,
      plan_id: row.plan_id,
    });
  }

  return due?.length ?? 0;
}

/** Emits `membership_expiring` for subscriptions renewing within 7 days. */
export async function emitExpiringMemberships(): Promise<number> {
  const db = getAdminClient();
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring } = await db
    .from("membership_subscriptions")
    .select("id, customer_id, plan_id, current_period_end")
    .eq("status", "active")
    .lte("current_period_end", sevenDaysOut);

  for (const row of expiring ?? []) {
    await db.from("membership_events").insert({
      subscription_id: row.id,
      event_type: "membership_expiring",
      detail: { current_period_end: row.current_period_end },
    });
    await emitEvent("membership_expiring", {
      membership_subscription_id: row.id,
      customer_id: row.customer_id,
      plan_id: row.plan_id,
    });
  }

  return expiring?.length ?? 0;
}
