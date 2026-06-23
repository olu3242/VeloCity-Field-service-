// Executive Intelligence (Batch X+3, Phase 8) — GABRIEL Executive
// Intelligence. Aggregates the existing FINN/ALICE/NOVA intelligence
// surfaces (recurring revenue, commercial revenue, retention risk,
// expansion opportunities) into a single executive briefing. No new
// computation is introduced here — every figure is a direct read of an
// already-certified report from Batch X+2/X+3.

import { getAdminClient } from "@/lib/supabase/admin";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";
import { computeCommercialRevenueIntelligence } from "@/lib/commercial/commercialRevenueIntelligence";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";

export interface ExecutiveBriefing {
  generatedAt: string;
  recurringRevenue: {
    mrrCents: number;
    arrCents: number;
    renewalRate: number;
    churnRate: number;
  };
  commercialRevenue: {
    totalCommercialRevenueCents: number;
    activeContractValueCents: number;
    atRiskContractCount: number;
    renewalPipelineCount: number;
  };
  retentionRisk: {
    atRiskMemberCount: number;
    inactiveMemberCount: number;
    missedServiceCount: number;
  };
  expansionPipeline: {
    openOpportunityCount: number;
    openOpportunityRevenueImpactCents: number;
  };
}

export async function computeExecutiveIntelligence(): Promise<ExecutiveBriefing> {
  const db = getAdminClient();

  const [recurring, commercial, retention, { data: opportunities }] = await Promise.all([
    computeRecurringRevenueIntelligence(),
    computeCommercialRevenueIntelligence(),
    computeMembershipRetentionIntelligence(),
    db.from("market_opportunities").select("expected_revenue_impact_cents").eq("status", "open"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    recurringRevenue: {
      mrrCents: recurring.mrrCents,
      arrCents: recurring.arrCents,
      renewalRate: recurring.renewalRate,
      churnRate: recurring.churnRate,
    },
    commercialRevenue: {
      totalCommercialRevenueCents: commercial.totalCommercialRevenueCents,
      activeContractValueCents: commercial.activeContractValueCents,
      atRiskContractCount: commercial.atRiskContracts.length,
      renewalPipelineCount: commercial.renewalPipeline.length,
    },
    retentionRisk: {
      atRiskMemberCount: retention.atRiskMembers.length,
      inactiveMemberCount: retention.inactiveMembers.length,
      missedServiceCount: retention.missedServices.length,
    },
    expansionPipeline: {
      openOpportunityCount: (opportunities ?? []).length,
      openOpportunityRevenueImpactCents: (opportunities ?? []).reduce((sum, o) => sum + (o.expected_revenue_impact_cents ?? 0), 0),
    },
  };
}
