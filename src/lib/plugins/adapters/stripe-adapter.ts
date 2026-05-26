export interface StripeAdapterConfig {
  webhookEvents: string[];
  paymentMethods: string[];
  currency: string;
  statementDescriptor: string;
}

export const DEFAULT_STRIPE_CONFIG: StripeAdapterConfig = {
  webhookEvents: [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.dispute.created",
    "payout.paid",
  ],
  paymentMethods: ["card"],
  currency: "usd",
  statementDescriptor: "VELOCITY SVC",
};

export function getStripeConfig(): StripeAdapterConfig {
  return DEFAULT_STRIPE_CONFIG;
}

export async function handleStripeWebhook(event: {
  type: string;
  data: Record<string, unknown>;
}): Promise<{ handled: boolean; action?: string }> {
  try {
    const { emitEvent } = await import("@/lib/automation/emitEvent");

    switch (event.type) {
      case "payment_intent.succeeded":
        await emitEvent("payment_captured", event.data);
        return { handled: true, action: "emitted_payment_intent.succeeded" };

      case "payment_intent.payment_failed":
        await emitEvent("payment_failed", event.data);
        return { handled: true, action: "emitted_payment_intent.payment_failed" };

      case "charge.dispute.created":
        await emitEvent("dispute_opened", event.data);
        await emitEvent("chargeback_opened", event.data);
        return { handled: true, action: "emitted_charge.dispute.created" };

      case "payout.paid":
        await emitEvent("payout_released", event.data);
        return { handled: true, action: "emitted_payout.paid" };

      default:
        return { handled: false };
    }
  } catch (err) {
    return {
      handled: false,
      action: err instanceof Error ? err.message : String(err),
    };
  }
}
