// TESS — Territory & Market Intelligence Agent
import { BaseAgent } from "./base";
import type { ServiceCategory } from "@/types";

export interface TessMarketOutput {
  supply_demand_balance: "oversupply" | "balanced" | "undersupply" | "critical_shortage";
  demand_score: number;
  supply_score: number;
  peak_hours: string[];
  surge_recommended: boolean;
  surge_multiplier?: number;
  top_requested_categories: ServiceCategory[];
  provider_recruitment_needed: boolean;
  recruitment_categories: ServiceCategory[];
  expansion_signal: boolean;
  expansion_areas: string[];
  market_insights: string[];
  weekly_forecast: string;
}

export interface TessServiceabilityOutput {
  is_serviceable: boolean;
  available_providers: number;
  estimated_wait_minutes: number | null;
  reason?: string;
  alternative_dates?: string[];
}

export class TessAgent extends BaseAgent {
  name = "TESS" as const;
  role = "Territory & Market Intelligence";
  systemPrompt = `You are TESS, the market intelligence AI for VeloCity Field Service.

You provide strategic intelligence about:
1. Supply vs demand balance by territory and category
2. Surge pricing recommendations
3. Provider recruitment priorities
4. Market expansion signals
5. Serviceability checks

Key metrics you analyze:
- Job request volume by ZIP/category/hour
- Provider online hours and acceptance rates
- Average wait times by area
- Seasonal demand patterns
- Competitor activity signals

Surge pricing: apply 1.25x-2.0x multiplier when demand > 2x supply
Provider recruitment: flag when average wait > 45 minutes or acceptance rate < 60%

ALWAYS respond with valid JSON.`;

  async analyzeMarket(
    city: string,
    state: string,
    activeJobs: number,
    onlineProviders: number,
    requestsLastHour: number,
    categoryBreakdown: Partial<Record<ServiceCategory, number>>,
    context: {} = {}
  ): Promise<TessMarketOutput | null> {
    const prompt = `Market analysis for ${city}, ${state}:
Active jobs: ${activeJobs}
Online providers: ${onlineProviders}
Job requests last hour: ${requestsLastHour}

Category breakdown:
${Object.entries(categoryBreakdown)
  .map(([cat, count]) => `- ${cat}: ${count} requests`)
  .join("\n")}

Analyze market health and provide recommendations. Respond with JSON.`;

    const result = await this.run<TessMarketOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async checkServiceability(
    zip: string,
    category: ServiceCategory,
    urgency: "scheduled" | "same_day" | "emergency",
    availableProviderCount: number,
    context: {} = {}
  ): Promise<TessServiceabilityOutput | null> {
    const prompt = `Serviceability check:
ZIP: ${zip}
Category: ${category}
Urgency: ${urgency}
Available providers in area: ${availableProviderCount}

Can we service this request? Respond with JSON.`;

    const result = await this.run<TessServiceabilityOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const tess = new TessAgent();
