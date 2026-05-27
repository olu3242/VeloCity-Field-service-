/**
 * Automation marketplace workflow template registry.
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  eventTypes: string[];
  steps: string[];
  authorTenantId?: string;
  published: boolean;
  publishedAt?: string;
  tags: string[];
  usageCount: number;
}

const REGISTRY: Map<string, WorkflowTemplate> = new Map([
  [
    "dispute-auto-resolve-v1",
    {
      id: "dispute-auto-resolve-v1",
      name: "Dispute Auto-Resolution",
      description: "Automatically resolves disputes using GABRIEL audit and IVY analysis.",
      version: "1.0.0",
      eventTypes: ["dispute_opened"],
      steps: ["GABRIEL audit", "IVY analysis", "auto-resolve or escalate"],
      published: true,
      publishedAt: new Date().toISOString(),
      tags: ["dispute", "automation"],
      usageCount: 0,
    },
  ],
  [
    "payment-recovery-v1",
    {
      id: "payment-recovery-v1",
      name: "Payment Recovery Flow",
      description: "Recovers failed payments via FINN retry logic with customer notification.",
      version: "1.0.0",
      eventTypes: ["payment_failed"],
      steps: ["FINN retry", "notify customer", "escalate if needed"],
      published: true,
      publishedAt: new Date().toISOString(),
      tags: ["payment", "recovery"],
      usageCount: 0,
    },
  ],
]);

export function publishTemplate(
  template: Omit<WorkflowTemplate, "usageCount">,
): WorkflowTemplate {
  if (!template.name.trim()) {
    throw new Error("Template name must not be empty");
  }
  if (!template.eventTypes.length) {
    throw new Error("Template must declare at least one event type");
  }
  const full: WorkflowTemplate = { ...template, usageCount: 0 };
  REGISTRY.set(template.id, full);
  return full;
}

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return REGISTRY.get(id);
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const q = query.toLowerCase();
  return Array.from(REGISTRY.values()).filter(
    (t) =>
      t.published &&
      (t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))),
  );
}

export function incrementUsage(id: string): void {
  const t = REGISTRY.get(id);
  if (t) t.usageCount++;
}

export function getAllPublished(): WorkflowTemplate[] {
  return Array.from(REGISTRY.values()).filter((t) => t.published);
}
