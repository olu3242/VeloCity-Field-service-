// REX — Quality, Trust & Risk Agent
import { BaseAgent } from "./base";
import type { Provider, Review } from "@/types";

export interface RexTrustOutput {
  trust_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_factors: string[];
  positive_signals: string[];
  recommended_actions: string[];
  suspension_recommended: boolean;
  monitoring_flags: string[];
}

export interface RexReviewAnalysis {
  sentiment: "positive" | "neutral" | "negative";
  authenticity_score: number;
  flags: string[];
  summary: string;
  impact_on_trust: "increase" | "neutral" | "decrease";
}

export class RexAgent extends BaseAgent {
  name = "REX" as const;
  role = "Quality & Trust Monitoring";
  systemPrompt = `You are REX, the trust and quality intelligence AI for VeloCity Field Service.

You protect the platform by:
1. Calculating dynamic trust scores for providers
2. Detecting fraud, gaming, and quality signals
3. Flagging providers who need intervention
4. Analyzing reviews for authenticity
5. Recommending provider suspensions or rewards

Trust Score Formula (0.0 - 1.0):
- Average rating (30%): weighted recent reviews
- Completion rate (25%): jobs completed vs accepted
- Response time (20%): average offer acceptance speed
- Customer satisfaction (15%): repeat bookings, disputes
- Platform compliance (10%): policy violations, complaints

Risk levels:
- low: trust > 0.7, no active flags
- medium: trust 0.5-0.7, minor flags
- high: trust 0.3-0.5, active issues
- critical: trust < 0.3, immediate action needed

ALWAYS respond with valid JSON.`;

  async analyzeTrust(
    provider: Partial<Provider>,
    recentReviews: Partial<Review>[],
    recentDisputes: number,
    cancellationRate: number,
    context: { userId?: string } = {}
  ): Promise<RexTrustOutput | null> {
    const avgRating =
      recentReviews.length > 0
        ? recentReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / recentReviews.length
        : 0;

    const prompt = `Analyze trust for provider:
Business: ${provider.business_name}
Current trust score: ${provider.trust_score}
Completed jobs: ${provider.completed_jobs}
Cancellation rate: ${(cancellationRate * 100).toFixed(1)}%
Recent disputes: ${recentDisputes}
Average rating (recent): ${avgRating.toFixed(2)} (${recentReviews.length} reviews)
Account age: ${provider.created_at ? Math.floor((Date.now() - new Date(provider.created_at).getTime()) / 86400000) : 0} days

Reviews summary:
${recentReviews
  .slice(0, 5)
  .map((r) => `- ${r.rating}★: ${r.comment ?? "No comment"}`)
  .join("\n")}

Calculate updated trust score and risk assessment. Respond with JSON.`;

    const result = await this.run<RexTrustOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async analyzeReview(
    rating: number,
    comment: string,
    jobContext: string,
    context: { jobId?: string } = {}
  ): Promise<RexReviewAnalysis | null> {
    const prompt = `Analyze this review for authenticity and sentiment:
Rating: ${rating}/5
Comment: "${comment}"
Job context: ${jobContext}

Flag any suspicious patterns (extremely generic praise, sudden negative after long gap, etc.). Respond with JSON.`;

    const result = await this.run<RexReviewAnalysis>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const rex = new RexAgent();
