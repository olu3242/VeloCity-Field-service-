/**
 * VeloCity Runtime — Context Hydration
 *
 * Enriches a base AgentContext with historical data from Supabase.
 * All queries are non-blocking: errors are caught and the field is omitted.
 */

import type { AgentName, AgentContext } from "@/lib/contracts/agents";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Hydrated context shape ────────────────────────────────────────────────

export interface ProviderHistory {
  completedJobs: number;
  avgRating: number;
  trustScore: number;
  recentDisputes: number;
}

export interface CustomerHistory {
  totalJobs: number;
  avgSpend: number;
  disputeRate: number;
  churnRisk: number;
}

export interface JobContext {
  status: string;
  category: string;
  quotedCents: number;
  daysSinceCreated: number;
}

export interface QueueState {
  pendingCount: number;
  processingCount: number;
}

export interface HydratedContext extends AgentContext {
  providerHistory?: ProviderHistory;
  customerHistory?: CustomerHistory;
  jobContext?: JobContext;
  queueState?: QueueState;
  /** True when at least one enrichment query succeeded */
  enriched: boolean;
}

// ── Base context input ────────────────────────────────────────────────────

export interface BaseContextInput {
  jobId?: string;
  tenantId?: string;
  userId?: string;
  disputeId?: string;
  providerId?: string;
}

// ── Hydration function ────────────────────────────────────────────────────

export async function hydrateContext(
  _agentName: AgentName,
  baseContext: BaseContextInput
): Promise<HydratedContext> {
  const hydrated: HydratedContext = {
    ...baseContext,
    enriched: false,
  };

  const { tenantId, jobId, userId, providerId } = baseContext;
  if (!tenantId) return hydrated;

  let enriched = false;

  try {
    const supabase = getAdminClient();

    // ── Provider history ────────────────────────────────────────────────
    const resolvedProviderId = providerId ?? (userId ?? null);
    if (resolvedProviderId) {
      try {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, provider_rating")
          .eq("tenant_id", tenantId)
          .eq("provider_id", resolvedProviderId)
          .eq("status", "completed");

        const { data: disputes } = await supabase
          .from("disputes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("provider_id", resolvedProviderId)
          .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString());

        if (jobs) {
          const ratings = jobs
            .map((j: Record<string, unknown>) => {
              const r = j["provider_rating"];
              return typeof r === "number" ? r : null;
            })
            .filter((r): r is number => r !== null);

          hydrated.providerHistory = {
            completedJobs: jobs.length,
            avgRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
            trustScore: Math.min(1, jobs.length / 50),
            recentDisputes: disputes?.length ?? 0,
          };
          enriched = true;
        }
      } catch {
        // non-blocking
      }
    }

    // ── Customer history ────────────────────────────────────────────────
    if (userId) {
      try {
        const { data: customerJobs } = await supabase
          .from("jobs")
          .select("id, quoted_price_cents, status")
          .eq("tenant_id", tenantId)
          .eq("customer_id", userId);

        if (customerJobs) {
          const completed = customerJobs.filter(
            (j: Record<string, unknown>) => j["status"] === "completed"
          );
          const disputed = customerJobs.filter(
            (j: Record<string, unknown>) => j["status"] === "disputed"
          );
          const prices = completed
            .map((j: Record<string, unknown>) => {
              const p = j["quoted_price_cents"];
              return typeof p === "number" ? p : null;
            })
            .filter((p): p is number => p !== null);

          hydrated.customerHistory = {
            totalJobs: customerJobs.length,
            avgSpend: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
            disputeRate: customerJobs.length > 0 ? disputed.length / customerJobs.length : 0,
            churnRisk: completed.length === 0 ? 1 : Math.max(0, 1 - completed.length / 10),
          };
          enriched = true;
        }
      } catch {
        // non-blocking
      }
    }

    // ── Job context ─────────────────────────────────────────────────────
    if (jobId) {
      try {
        const { data: job } = await supabase
          .from("jobs")
          .select("status, category, quoted_price_cents, created_at")
          .eq("tenant_id", tenantId)
          .eq("id", jobId)
          .single();

        if (job) {
          const daysSince = job["created_at"]
            ? Math.floor((Date.now() - new Date(job["created_at"] as string).getTime()) / 86_400_000)
            : 0;
          hydrated.jobContext = {
            status: typeof job["status"] === "string" ? job["status"] : "unknown",
            category: typeof job["category"] === "string" ? job["category"] : "other",
            quotedCents: typeof job["quoted_price_cents"] === "number" ? job["quoted_price_cents"] : 0,
            daysSinceCreated: daysSince,
          };
          enriched = true;
        }
      } catch {
        // non-blocking
      }
    }

    // ── Queue state ─────────────────────────────────────────────────────
    try {
      const { count: pendingCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending");

      const { count: processingCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "dispatched");

      hydrated.queueState = {
        pendingCount: pendingCount ?? 0,
        processingCount: processingCount ?? 0,
      };
      enriched = true;
    } catch {
      // non-blocking
    }
  } catch {
    // admin client unavailable — return base context
  }

  hydrated.enriched = enriched;
  return hydrated;
}
