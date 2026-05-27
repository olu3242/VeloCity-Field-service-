import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";
import { getEnv, requireEnv } from "@/lib/env";
import { calculatePlatformFee } from "@/lib/utils";
import type { PaymentIntentType } from "@/lib/payments/types";

// Server-side Stripe instance
let stripeClient: Stripe | null = null;

export function getStripeServer() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-04-10",
      typescript: true,
    });
  }
  return stripeClient;
}

// Client-side Stripe promise (lazy-loaded)
let stripePromise: ReturnType<typeof loadStripe> | null = null;
export function getStripe() {
  if (!stripePromise) {
    const publishableKey = getEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    stripePromise = publishableKey ? loadStripe(publishableKey) : Promise.resolve(null);
  }
  return stripePromise;
}

// ============================================================
// PAYMENT INTENT
// ============================================================

export async function createPaymentIntent(
  amountCents: number,
  customerId: string,
  jobId: string,
  type: PaymentIntentType,
  stripeCustomerId?: string,
  tenantId?: string
): Promise<Stripe.PaymentIntent> {
  const platformFee = calculatePlatformFee(amountCents);

  return getStripeServer().paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: stripeCustomerId,
    metadata: {
      job_id: jobId,
      customer_id: customerId,
      tenant_id: tenantId ?? "",
      payment_type: type,
      platform_fee_cents: String(platformFee),
    },
    automatic_payment_methods: { enabled: true },
    description: `VeloCity ${type} payment for job ${jobId}`,
  });
}

// ============================================================
// STRIPE CONNECT — PROVIDER PAYOUTS
// ============================================================

export async function createConnectedAccount(
  email: string,
  providerId: string
): Promise<Stripe.Account> {
  return getStripeServer().accounts.create({
    type: "express",
    email,
    metadata: { provider_id: providerId },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
  });
}

export async function createAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<Stripe.AccountLink> {
  return getStripeServer().accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });
}

export async function transferToProvider(
  amountCents: number,
  stripeAccountId: string,
  jobId: string,
  paymentIntentId: string
): Promise<Stripe.Transfer> {
  const platformFee = calculatePlatformFee(amountCents);
  const providerPayout = amountCents - platformFee;

  return getStripeServer().transfers.create({
    amount: providerPayout,
    currency: "usd",
    destination: stripeAccountId,
    metadata: {
      job_id: jobId,
      payment_intent_id: paymentIntentId,
      platform_fee_cents: String(platformFee),
    },
  });
}

// ============================================================
// REFUNDS
// ============================================================

export async function createRefund(
  paymentIntentId: string,
  amountCents: number,
  reason: "duplicate" | "fraudulent" | "requested_by_customer"
): Promise<Stripe.Refund> {
  return getStripeServer().refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
    reason,
  });
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

export async function createSubscription(
  stripeCustomerId: string,
  priceId: string,
  metadata: Record<string, string>
): Promise<Stripe.Subscription> {
  return getStripeServer().subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    metadata,
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripeServer().subscriptions.cancel(subscriptionId);
}

// ============================================================
// WEBHOOK VERIFICATION
// ============================================================

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return getStripeServer().webhooks.constructEvent(
    payload,
    signature,
    requireEnv("STRIPE_WEBHOOK_SECRET")
  );
}
