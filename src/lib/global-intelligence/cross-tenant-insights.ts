/**
 * Cross-tenant operational insights — anonymized, no raw tenant data exposed.
 * Persists to enterprise_memory (category: "platform_insight") when an admin client is available.
 */

import { getAdminClient } from "@/lib/supabase/admin";

export interface CrossTenantInsight {
  id: string;
  insightType: "trend" | "anomaly" | "benchmark" | "forecast";
  title: string;
  summary: string;
  affectedTenantCount: number;
  confidenceScore: number;
  generatedAt: string;
  tags: string[];
}

const MAX_INSIGHTS = 200;
const INSIGHTS: CrossTenantInsight[] = [];

export function recordInsight(
  insight: Omit<CrossTenantInsight, "id" | "generatedAt">,
  persistTenantId?: string,
): CrossTenantInsight {
  const full: CrossTenantInsight = {
    ...insight,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
  };
  if (INSIGHTS.length >= MAX_INSIGHTS) INSIGHTS.shift();
  INSIGHTS.push(full);

  if (persistTenantId) {
    try {
      getAdminClient()
        .from("enterprise_memory")
        .insert({
          tenant_id: persistTenantId,
          category: "platform_insight",
          entity_type: "cross_tenant",
          summary: `[${full.insightType}] ${full.title}: ${full.summary}`,
          detail: {
            insightId: full.id,
            insightType: full.insightType,
            affectedTenantCount: full.affectedTenantCount,
            confidenceScore: full.confidenceScore,
            tags: full.tags,
          },
          tags: ["platform_insight", full.insightType, ...full.tags],
          importance: full.confidenceScore >= 0.8 ? "high" : "normal",
        })
        .then(() => {});
    } catch {
      // non-fatal — in-memory record always created
    }
  }

  return full;
}

export function getInsightsByType(
  type: CrossTenantInsight["insightType"],
): CrossTenantInsight[] {
  return INSIGHTS.filter((i) => i.insightType === type);
}

export function getRecentInsights(limit = 20): CrossTenantInsight[] {
  return INSIGHTS.slice(-limit).reverse();
}

export function generatePlatformSummary(): {
  totalInsights: number;
  byType: Record<string, number>;
  avgConfidence: number;
  topTags: string[];
} {
  const byType: Record<string, number> = {};
  const tagCounts: Map<string, number> = new Map();
  let totalConfidence = 0;

  for (const insight of INSIGHTS) {
    byType[insight.insightType] = (byType[insight.insightType] ?? 0) + 1;
    totalConfidence += insight.confidenceScore;
    for (const tag of insight.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const avgConfidence =
    INSIGHTS.length > 0 ? totalConfidence / INSIGHTS.length : 0;

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    totalInsights: INSIGHTS.length,
    byType,
    avgConfidence,
    topTags,
  };
}
