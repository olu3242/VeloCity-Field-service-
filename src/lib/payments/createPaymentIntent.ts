import { hasEnvGroup } from "@/lib/env";
import { createPaymentIntent as createStripePaymentIntent } from "@/lib/stripe/client";

export async function createVelocityPaymentIntent(input: {
  amountCents: number;
  customerId: string;
  jobId: string;
  type: "deposit" | "final";
  stripeCustomerId?: string;
}) {
  if (!hasEnvGroup("stripe")) {
    return {
      id: `local_pi_${crypto.randomUUID()}`,
      client_secret: `local_secret_${crypto.randomUUID()}`,
      mode: "local-dev" as const,
    };
  }
  const intent = await createStripePaymentIntent(input.amountCents, input.customerId, input.jobId, input.type, input.stripeCustomerId);
  return { ...intent, mode: "stripe" as const };
}
