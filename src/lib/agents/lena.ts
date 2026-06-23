// LENA — Customer Retention & Rebooking Agent
import { BaseAgent, type AgentContext } from "./base";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Job, ServiceCategory } from "@/types";

export interface LenaGrowthPathOutput {
  provider_id: string;
  learning_path: Array<{
    service_type_id: string;
    service_type_name: string;
    current_tier: string;
    next_tier: string | null;
    gap_summary: string;
  }>;
  certification_path: Array<{
    category: string;
    current_tier: string | null;
    next_tier: string;
    jobs_gap: number;
    rating_gap: number;
  }>;
  service_expansion_path: Array<{
    category: string;
    demand_jobs_last_90_days: number;
    reason: string;
  }>;
}

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

  /**
   * Deterministic growth-path recommendation, computed entirely from
   * provider_skills/provider_skill_progress, provider_certifications/
   * provider_certification_requirements, and real platform demand
   * (jobs in the last 90 days). No LLM call — every entry is traceable
   * to a row in those tables, per Rule 2 (no synthetic recommendations).
   */
  async recommendGrowthPath(providerId: string): Promise<LenaGrowthPathOutput> {
    const db = getAdminClient();

    const [{ data: progressRows }, { data: provider }, { data: certifications }] = await Promise.all([
      db
        .from("provider_skill_progress")
        .select("service_type_id, current_tier, next_tier, gap_summary, service_types(name)")
        .eq("provider_id", providerId),
      db.from("providers").select("categories").eq("id", providerId).single(),
      db.from("provider_certifications").select("category, tier, is_active").eq("provider_id", providerId),
    ]);

    const learning_path = (progressRows ?? [])
      .filter((row: { next_tier: string | null }) => row.next_tier !== null)
      .map((row: any) => ({
        service_type_id: row.service_type_id,
        service_type_name: row.service_types?.name ?? "Unknown",
        current_tier: row.current_tier,
        next_tier: row.next_tier,
        gap_summary: row.gap_summary ?? "",
      }));

    const providerCategories: string[] = provider?.categories ?? [];
    const certification_path: LenaGrowthPathOutput["certification_path"] = [];

    for (const category of providerCategories) {
      const activeCert = certifications?.find(
        (c: { category: string; is_active: boolean }) => c.category === category && c.is_active
      );
      const currentTier: string | null = activeCert?.tier ?? null;
      const tierOrder = ["bronze", "silver", "gold", "elite"];
      const nextTierIdx = currentTier ? tierOrder.indexOf(currentTier) + 1 : 0;
      const nextTier = tierOrder[nextTierIdx];
      if (!nextTier) continue;

      const { data: req } = await db
        .from("provider_certification_requirements")
        .select("min_completed_jobs, min_average_rating")
        .eq("category", category)
        .eq("tier", nextTier)
        .maybeSingle();
      if (!req) continue;

      const { data: jobs } = await db
        .from("jobs")
        .select("id")
        .eq("provider_id", providerId)
        .eq("category", category)
        .in("status", ["completed", "customer_confirmed"]);
      const completedJobsCount = jobs?.length ?? 0;

      certification_path.push({
        category,
        current_tier: currentTier,
        next_tier: nextTier,
        jobs_gap: Math.max(req.min_completed_jobs - completedJobsCount, 0),
        rating_gap: req.min_average_rating,
      });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: openCategoryJobs } = await db
      .from("jobs")
      .select("category")
      .gte("created_at", ninetyDaysAgo);

    const demandByCategory = new Map<string, number>();
    for (const row of openCategoryJobs ?? []) {
      demandByCategory.set(row.category, (demandByCategory.get(row.category) ?? 0) + 1);
    }

    const service_expansion_path: LenaGrowthPathOutput["service_expansion_path"] = [];
    for (const [category, count] of Array.from(demandByCategory.entries())) {
      if (providerCategories.includes(category)) continue;
      if (count > 0) {
        service_expansion_path.push({
          category,
          demand_jobs_last_90_days: count,
          reason: `${count} job(s) requested in this category over the last 90 days that this provider is not yet eligible for`,
        });
      }
    }
    service_expansion_path.sort((a, b) => b.demand_jobs_last_90_days - a.demand_jobs_last_90_days);

    return {
      provider_id: providerId,
      learning_path,
      certification_path,
      service_expansion_path,
    };
  }
}

export const lena = new LenaAgent();
