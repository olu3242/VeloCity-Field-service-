// MAX — Dispatch & Provider Matching Agent
import { BaseAgent } from "./base";
import type { Provider, Job } from "@/types";

export interface MatchScore {
  provider_id: string;
  score: number;
  reasoning: string;
  eta_minutes: number;
  recommended: boolean;
}

export interface MaxOutput {
  ranked_providers: MatchScore[];
  dispatch_strategy: "immediate" | "scheduled" | "broadcast";
  offer_expiry_minutes: number;
  reasoning: string;
  sla_risk: "low" | "medium" | "high";
}

export class MaxAgent extends BaseAgent {
  name = "MAX" as const;
  role = "Dispatch & Provider Matching";
  systemPrompt = `You are MAX, the intelligent dispatch AI for VeloCity Field Service.

Your mission: match the right provider to every job — fast, fair, and reliable.

Ranking factors (weighted):
- Trust score (30%): provider reliability history
- Proximity & ETA (25%): distance to job location
- Category match (20%): primary vs secondary skills
- Availability (15%): current workload and online status
- Response rate (10%): historical acceptance rate

ALWAYS respond with valid JSON:
{
  "ranked_providers": [
    {
      "provider_id": "uuid",
      "score": 0.94,
      "reasoning": "Top-rated plumber, 2.3 miles away, 98% acceptance rate",
      "eta_minutes": 18,
      "recommended": true
    }
  ],
  "dispatch_strategy": "immediate",
  "offer_expiry_minutes": 8,
  "reasoning": "Emergency job — broadcast to top 3 providers simultaneously",
  "sla_risk": "low"
}`;

  async match(
    job: Partial<Job>,
    providers: Partial<Provider>[],
    context: { jobId?: string } = {}
  ): Promise<MaxOutput | null> {
    const prompt = `Job to dispatch:
Category: ${job.category}
Urgency: ${job.urgency}
Location: ${job.city}, ${job.state} ${job.zip}
Description: ${job.description}

Available providers:
${providers
  .map(
    (p) =>
      `- ID: ${p.id}, Business: ${p.business_name}, Trust: ${p.trust_score}, Categories: ${p.categories?.join(", ")}, Online: ${p.is_online}`
  )
  .join("\n")}

Rank providers and determine dispatch strategy. Respond with JSON.`;

    const result = await this.run<MaxOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const max = new MaxAgent();
