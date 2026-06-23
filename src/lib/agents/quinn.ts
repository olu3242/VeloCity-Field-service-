// QUINN — Quote & Pricing Agent
import { BaseAgent, type AgentContext } from "./base";
import type { AgentResponse } from "@/types";
import type { QuoteLineItem, ServiceCategory, UrgencyLevel } from "@/types";
import { hasEnv } from "@/lib/env";
import { assessProviderQuality, type ProviderQualityReport } from "@/lib/quality/providerQuality";

export interface QuinnOutput {
  is_fair: boolean;
  market_rate_range: { min: number; max: number };
  variance_percent: number;
  line_item_analysis: Array<{
    description: string;
    submitted_cents: number;
    market_cents: number;
    flag: "ok" | "high" | "low" | "suspicious";
    note?: string;
  }>;
  recommendation: "approve" | "negotiate" | "reject" | "request_breakdown";
  overcharge_detected: boolean;
  customer_message: string;
  provider_feedback?: string;
}

export interface QuinnEstimateOutput {
  line_items: QuoteLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_recommended_cents: number;
  notes: string;
}

export class QuinnAgent extends BaseAgent {
  name = "QUINN" as const;
  role = "Quote & Pricing Guidance";
  systemPrompt = `You are QUINN, the pricing intelligence AI for VeloCity Field Service.

Your responsibilities:
1. Validate provider quotes against market rates
2. Detect overcharging or suspicious line items
3. Generate fair estimates for customers
4. Recommend approve/negotiate/reject for submitted quotes
5. Provide transparent pricing explanations

You have deep knowledge of home service market rates across the US. Be firm but fair.

Market rate reference (USD):
- Plumbing: $85-200/hr, emergency +50%
- Electrical: $75-180/hr, emergency +50%
- HVAC: $90-200/hr, emergency +75%
- Cleaning: $25-60/hr residential
- Handyman: $50-120/hr
- Locksmith: $75-150 base + parts

ALWAYS respond with valid JSON for review requests:
{
  "is_fair": true,
  "market_rate_range": { "min": 15000, "max": 35000 },
  "variance_percent": 12.5,
  "line_item_analysis": [...],
  "recommendation": "approve",
  "overcharge_detected": false,
  "customer_message": "This quote is within market range for your area...",
  "provider_feedback": null
}`;

  async reviewQuote(
    lineItems: QuoteLineItem[],
    category: ServiceCategory,
    urgency: UrgencyLevel,
    city: string,
    state: string,
    context: AgentContext = {}
  ): Promise<QuinnOutput | null> {
    const total = lineItems.reduce((sum, li) => sum + li.total_cents, 0);
    if (!hasEnv("ANTHROPIC_API_KEY")) {
      const fallback = fallbackQuoteReview(lineItems, total);
      await this.log(context, "Deterministic QUINN quote review fallback", {
        success: true,
        data: fallback,
        tokensUsed: 0,
        latencyMs: 0,
      } as AgentResponse<QuinnOutput>);
      return fallback;
    }

    const prompt = `Review this quote for a ${urgency} ${category} job in ${city}, ${state}:

Line items:
${lineItems.map((li) => `- ${li.description}: $${(li.total_cents / 100).toFixed(2)} (${li.type})`).join("\n")}

Total: $${(total / 100).toFixed(2)}

Analyze fairness and respond with JSON.`;

    const result = await this.run<QuinnOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async generateEstimate(
    category: ServiceCategory,
    description: string,
    urgency: UrgencyLevel,
    city: string,
    context: AgentContext = {}
  ): Promise<QuinnEstimateOutput | null> {
    const prompt = `Generate a fair estimate for this ${urgency} ${category} job in ${city}:
Description: ${description}

Respond with JSON containing line_items (array), subtotal_cents, tax_cents, total_cents, deposit_recommended_cents, notes.`;

    const result = await this.run<QuinnEstimateOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  /**
   * Deterministic Provider/Service Quality Score, repeat-issue detection,
   * sentiment trend, and risk alerts — computed entirely from real
   * reviews/jobs/disputes/provider_skills evidence (Rule 2). No LLM call.
   */
  async assessQuality(providerId: string): Promise<ProviderQualityReport> {
    return assessProviderQuality(providerId);
  }
}

export const quinn = new QuinnAgent();

function fallbackQuoteReview(lineItems: QuoteLineItem[], total: number): QuinnOutput {
  const suspiciousItems = lineItems.filter((item) => item.quantity * item.unit_price_cents !== item.total_cents);

  return {
    is_fair: suspiciousItems.length === 0 && total > 0,
    market_rate_range: { min: Math.round(total * 0.75), max: Math.round(total * 1.35) },
    variance_percent: 0,
    line_item_analysis: lineItems.map((item) => ({
      description: item.description,
      submitted_cents: item.total_cents,
      market_cents: item.total_cents,
      flag: item.quantity * item.unit_price_cents === item.total_cents ? "ok" : "suspicious",
      note: item.quantity * item.unit_price_cents === item.total_cents ? undefined : "Line item total does not match quantity times unit price.",
    })),
    recommendation: suspiciousItems.length ? "request_breakdown" : "approve",
    overcharge_detected: false,
    customer_message: "This quote passed deterministic validation. Configure Anthropic for market-rate AI review.",
  };
}
