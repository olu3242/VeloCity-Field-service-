/**
 * Policy-aware AI capability activation.
 * All activations pass through the AI policy engine before being granted.
 */

import { randomUUID } from "crypto";
import { getEffectiveAction } from "@/lib/ai-policy/execution-rules";

export interface CapabilityActivation {
  activationId: string;
  tenantId: string;
  capabilityId: string;
  eventType: string;
  policyDecision: string;
  allowed: boolean;
  activatedAt: string;
  expiresAt?: string;
}

const CAP = 500;
export const ACTIVATIONS: CapabilityActivation[] = [];

export async function activateCapability(
  tenantId: string,
  capabilityId: string,
  eventType: string
): Promise<CapabilityActivation> {
  const policyDecision = await getEffectiveAction(capabilityId, eventType, {});
  const allowed = policyDecision !== "deny";

  const activation: CapabilityActivation = {
    activationId: randomUUID(),
    tenantId,
    capabilityId,
    eventType,
    policyDecision,
    allowed,
    activatedAt: new Date().toISOString(),
  };

  ACTIVATIONS.push(activation);
  if (ACTIVATIONS.length > CAP) {
    ACTIVATIONS.shift();
  }

  return activation;
}

export function getActiveCapabilities(tenantId: string): CapabilityActivation[] {
  const now = new Date().toISOString();
  return ACTIVATIONS.filter(
    (a) =>
      a.tenantId === tenantId &&
      a.allowed &&
      (a.expiresAt === undefined || a.expiresAt > now)
  );
}

export function revokeCapability(activationId: string): void {
  const activation = ACTIVATIONS.find((a) => a.activationId === activationId);
  if (activation) {
    activation.expiresAt = new Date().toISOString();
  }
}

export function getActivationHistory(
  tenantId: string,
  limit = 20
): CapabilityActivation[] {
  return ACTIVATIONS
    .filter((a) => a.tenantId === tenantId)
    .slice(-limit);
}
