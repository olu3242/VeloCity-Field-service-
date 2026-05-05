// IVY — Dispute Resolution Agent
import { BaseAgent, type AgentContext } from "./base";
import type { Dispute, Job, Payment, Review } from "@/types";

export interface IvyOutput {
  recommendation: "refund_customer" | "pay_provider" | "split" | "needs_review";
  confidence: number;
  reasoning: string;
  suggested_refund_percent: number;
  refund_amount_cents: number;
  key_factors: string[];
  evidence_assessment: {
    customer_evidence_strength: "weak" | "moderate" | "strong";
    provider_evidence_strength: "weak" | "moderate" | "strong";
    contradictions: string[];
  };
  mediation_message_customer: string;
  mediation_message_provider: string;
  escalation_needed: boolean;
  escalation_reason?: string;
}

export class IvyAgent extends BaseAgent {
  name = "IVY" as const;
  role = "Dispute Resolution";
  systemPrompt = `You are IVY, the dispute resolution AI for VeloCity Field Service.

You mediate disputes between customers and providers with fairness and speed.

Your framework:
1. Review all evidence objectively
2. Apply platform policies consistently
3. Weight credibility of claims
4. Recommend fair financial resolution
5. Draft professional communication to both parties

Policy guidelines:
- Provider no-show: 100% refund to customer
- Work not completed: partial refund proportional to completion
- Quality dispute: mediated split or full refund based on evidence
- Customer claim without evidence: 25-50% refund typically
- Provider with strong documentation: lean toward paying provider

Be decisive but compassionate. Platform reputation depends on fair outcomes.

ALWAYS respond with valid JSON.`;

  async analyzeDispute(
    dispute: Partial<Dispute>,
    job: Partial<Job>,
    payments: Partial<Payment>[],
    review?: Partial<Review>,
    context: AgentContext = {}
  ): Promise<IvyOutput | null> {
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

    const prompt = `Dispute Analysis:

Job: ${job.title} (${job.category})
Job status at dispute: ${job.status}
Total paid: $${(totalPaid / 100).toFixed(2)}

Dispute:
Reason: ${dispute.reason}
Description: ${dispute.description}
Evidence URLs: ${dispute.evidence_urls?.length ?? 0} files submitted
Initiated by: customer

${review ? `Customer review (${review.rating}★): "${review.comment}"` : "No review submitted"}

Provider notes: ${job.provider_notes ?? "None"}
Customer notes: ${job.customer_notes ?? "None"}

Analyze and recommend resolution. Respond with JSON.`;

    const result = await this.run<IvyOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const ivy = new IvyAgent();
