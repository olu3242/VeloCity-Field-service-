// QUINN — Quote & Pricing Agent
import { BaseAgent } from "./base";
import type { QuoteLineItem, ServiceCategory, UrgencyLevel } from "@/types";

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
    context: { jobId?: string } = {}
  ): Promise<QuinnOutput | null> {
    const total = lineItems.reduce((sum, li) => sum + li.total_cents, 0);
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
    context: { jobId?: string } = {}
  ): Promise<QuinnEstimateOutput | null> {
    const prompt = `Generate a fair estimate for this ${urgency} ${category} job in ${city}:
Description: ${description}

Respond with JSON containing line_items (array), subtotal_cents, tax_cents, total_cents, deposit_recommended_cents, notes.`;

    const result = await this.run<QuinnEstimateOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const quinn = new QuinnAgent();
