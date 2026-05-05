// LENA — Customer Retention & Rebooking Agent
import { BaseAgent, type AgentContext } from "./base";
import type { Job, ServiceCategory } from "@/types";

export interface LenaRebookOutput {
  should_offer_rebook: boolean;
  recommended_services: Array<{
    category: ServiceCategory;
    title: string;
    description: string;
    urgency: "scheduled" | "same_day";
    estimated_cost_range: { min: number; max: number };
    next_due_date?: string;
    reason: string;
  }>;
  subscription_recommendation?: {
    plan_name: string;
    interval: "monthly" | "quarterly";
    description: string;
    estimated_savings_percent: number;
  };
  message: string;
  send_in_days: number;
}

export interface LenaRetentionOutput {
  churn_risk: "low" | "medium" | "high";
  risk_factors: string[];
  retention_actions: string[];
  offer_type: "discount" | "priority_booking" | "subscription" | "none";
  offer_value?: string;
  personalized_message: string;
}

export class LenaAgent extends BaseAgent {
  name = "LENA" as const;
  role = "Customer Retention & Rebooking";
  systemPrompt = `You are LENA, the customer retention and rebooking AI for VeloCity Field Service.

You maximize customer lifetime value by:
1. Predicting when customers need recurring services
2. Personalizing rebook recommendations
3. Identifying churn risk before it happens
4. Crafting offers that feel helpful, not pushy
5. Recommending subscription plans for recurring needs

Service maintenance schedules:
- HVAC: every 6 months (spring/fall)
- Cleaning: monthly or bi-weekly
- Pest control: quarterly
- Landscaping: bi-weekly in growing season
- Pool service: weekly in summer, monthly off-season

Churn signals:
- No booking in 90+ days after regular use
- Low satisfaction rating on last job
- Disputed last job
- Provider no-show experience

ALWAYS respond with valid JSON. Be warm and human — this is a relationship, not a transaction.`;

  async recommendRebook(
    customerId: string,
    pastJobs: Partial<Job>[],
    lastJobDaysAgo: number,
    context: AgentContext = {}
  ): Promise<LenaRebookOutput | null> {
    const categories = Array.from(new Set(pastJobs.map((j) => j.category)));
    const avgRating = 4.2;

    const prompt = `Customer rebooking analysis:
Customer ID: ${customerId}
Days since last job: ${lastJobDaysAgo}
Past service categories: ${categories.join(", ")}
Total jobs: ${pastJobs.length}
Average satisfaction: ${avgRating}/5

Past jobs:
${pastJobs
  .slice(0, 5)
  .map((j) => `- ${j.category}: ${j.title} (${j.status})`)
  .join("\n")}

What services should we proactively offer? Respond with JSON.`;

    const result = await this.run<LenaRebookOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async assessChurnRisk(
    customerId: string,
    lastJobRating: number,
    lastJobStatus: string,
    daysSinceLastJob: number,
    totalJobs: number,
    context: AgentContext = {}
  ): Promise<LenaRetentionOutput | null> {
    const prompt = `Churn risk assessment:
Customer ID: ${customerId}
Last job rating: ${lastJobRating}/5
Last job outcome: ${lastJobStatus}
Days since last job: ${daysSinceLastJob}
Total lifetime jobs: ${totalJobs}

Is this customer at risk of churning? What retention action should we take? Respond with JSON.`;

    const result = await this.run<LenaRetentionOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const lena = new LenaAgent();
