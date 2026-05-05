// FINN — Finance & Payment Monitoring Agent
import { BaseAgent } from "./base";
import type { Payment, Job } from "@/types";

export interface FinnPayoutOutput {
  should_release: boolean;
  payout_amount_cents: number;
  platform_fee_cents: number;
  hold_reason?: string;
  hold_until?: string;
  risk_flags: string[];
  payment_note: string;
}

export interface FinnReconciliationOutput {
  total_revenue_cents: number;
  total_payouts_cents: number;
  platform_earnings_cents: number;
  pending_payouts_cents: number;
  disputed_amount_cents: number;
  anomalies: string[];
  recommendations: string[];
}

export class FinnAgent extends BaseAgent {
  name = "FINN" as const;
  role = "Finance & Payment Monitoring";
  systemPrompt = `You are FINN, the financial intelligence AI for VeloCity Field Service.

You monitor payments, escrow, and payouts to ensure financial integrity.

Responsibilities:
1. Evaluate when to release escrow to providers
2. Flag suspicious payment patterns
3. Reconcile daily revenue and payouts
4. Monitor for chargeback risk
5. Recommend payout timing and amounts

Payout rules:
- Standard: release 48hrs after customer confirmation
- Emergency jobs: release 24hrs after completion
- Disputed jobs: hold until dispute resolved
- New providers (<10 jobs): 5-day hold
- Providers with chargebacks: 7-day hold

Platform fee structure:
- Under $100: 20%
- $100-500: 18%
- Over $500: 15%

ALWAYS respond with valid JSON.`;

  async evaluatePayout(
    job: Partial<Job>,
    payments: Partial<Payment>[],
    providerCompletedJobs: number,
    hasActiveDispute: boolean,
    context: { jobId?: string } = {}
  ): Promise<FinnPayoutOutput | null> {
    const totalCaptured = payments
      .filter((p) => p.status === "captured" || p.status === "escrowed")
      .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

    const prompt = `Evaluate payout for completed job:
Job: ${job.title} (${job.category})
Status: ${job.status}
Completed at: ${job.actual_end ?? "unknown"}
Urgency: ${job.urgency}

Provider stats:
- Completed jobs: ${providerCompletedJobs}
- Active dispute: ${hasActiveDispute}

Payments:
Total captured: $${(totalCaptured / 100).toFixed(2)}
${payments.map((p) => `- ${p.type}: $${((p.amount_cents ?? 0) / 100).toFixed(2)} (${p.status})`).join("\n")}

Should we release payout? Respond with JSON.`;

    const result = await this.run<FinnPayoutOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async reconcile(
    payments: Partial<Payment>[],
    dateRange: { from: string; to: string },
    context: {} = {}
  ): Promise<FinnReconciliationOutput | null> {
    const summary = {
      total: payments.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
      captured: payments.filter((p) => p.status === "captured").length,
      pending: payments.filter((p) => p.status === "pending").length,
      refunded: payments.filter((p) => p.status === "refunded").reduce((s, p) => s + (p.amount_cents ?? 0), 0),
    };

    const prompt = `Reconcile payments from ${dateRange.from} to ${dateRange.to}:
Total transactions: ${payments.length}
Total amount: $${(summary.total / 100).toFixed(2)}
Captured: ${summary.captured}
Pending: ${summary.pending}
Refunded: $${(summary.refunded / 100).toFixed(2)}

Identify anomalies and provide reconciliation report. Respond with JSON.`;

    const result = await this.run<FinnReconciliationOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const finn = new FinnAgent();
