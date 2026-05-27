/**
 * AI orchestration template registry.
 * Templates describe reusable multi-capability workflows.
 */

export interface OrchestrationTemplate {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  triggerEventType: string;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  successRateEstimate: number;
  policyChecked: boolean;
  version: string;
  createdAt: string;
}

export const TEMPLATES: Map<string, OrchestrationTemplate> = new Map<string, OrchestrationTemplate>();

// Pre-registered templates
TEMPLATES.set("dispute-full-flow", {
  id: "dispute-full-flow",
  name: "Full Dispute Resolution",
  description: "End-to-end dispute handling: audit then resolve",
  capabilities: ["gabriel-audit", "ivy-resolve"],
  triggerEventType: "dispute_opened",
  estimatedCostUsd: 0.025,
  estimatedDurationMs: 60_000,
  successRateEstimate: 0.95,
  policyChecked: true,
  version: "1.0.0",
  createdAt: new Date().toISOString(),
});

TEMPLATES.set("payment-recovery-flow", {
  id: "payment-recovery-flow",
  name: "Payment Recovery",
  description: "Automated payment failure retry with customer notification",
  capabilities: ["finn-retry", "aria-notify"],
  triggerEventType: "payment_failed",
  estimatedCostUsd: 0.015,
  estimatedDurationMs: 30_000,
  successRateEstimate: 0.90,
  policyChecked: true,
  version: "1.0.0",
  createdAt: new Date().toISOString(),
});

export function publishTemplate(template: OrchestrationTemplate): void {
  TEMPLATES.set(template.id, template);
}

export function getTemplate(id: string): OrchestrationTemplate | undefined {
  return TEMPLATES.get(id);
}

export function getTemplatesForEvent(eventType: string): OrchestrationTemplate[] {
  return Array.from(TEMPLATES.values()).filter(
    (t) => t.triggerEventType === eventType
  );
}

export function validateTemplate(template: OrchestrationTemplate): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (template.capabilities.length === 0) {
    issues.push("Template must include at least one capability");
  }
  if (!template.triggerEventType || template.triggerEventType.trim() === "") {
    issues.push("triggerEventType must not be empty");
  }
  if (template.successRateEstimate < 0 || template.successRateEstimate > 1) {
    issues.push("successRateEstimate must be between 0 and 1");
  }
  if (template.estimatedCostUsd < 0) {
    issues.push("estimatedCostUsd must be >= 0");
  }

  return { valid: issues.length === 0, issues };
}
