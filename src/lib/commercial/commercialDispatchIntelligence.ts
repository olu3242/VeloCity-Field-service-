// Commercial Dispatch Intelligence (Batch X+3, Phase 9) — MAX Dispatch
// Intelligence Extension. MAX's existing 5-factor match (trust, proximity,
// category, availability, response rate — src/lib/agents/max.ts) has no
// certification, capacity, contract, or SLA dimension. This module computes
// those four missing factors for a commercial job and is consulted by MAX
// before/alongside its existing match() call — it does not replace or
// duplicate the matching engine.

import { getAdminClient } from "@/lib/supabase/admin";

export interface CommercialDispatchPriority {
  isCommercial: boolean;
  contractId: string | null;
  requiredServiceTypeIds: string[];
  slaDeadline: string | null;
  eligibleProviderIds: string[];
  ineligibleReasons: Record<string, string>;
}

const MIN_CERTIFIED_TIER = ["gold", "elite"];

export async function computeCommercialDispatchPriority(jobId: string, candidateProviderIds: string[]): Promise<CommercialDispatchPriority> {
  const db = getAdminClient();

  const { data: job } = await db.from("jobs").select("id, category, commercial_account_id, commercial_contract_id, created_at").eq("id", jobId).maybeSingle();

  if (!job?.commercial_contract_id) {
    return {
      isCommercial: false,
      contractId: null,
      requiredServiceTypeIds: [],
      slaDeadline: null,
      eligibleProviderIds: candidateProviderIds,
      ineligibleReasons: {},
    };
  }

  const [{ data: contract }, { data: servicePlans }, { data: certifications }, { data: activeJobCounts }] = await Promise.all([
    db.from("commercial_contracts").select("id, sla_response_minutes").eq("id", job.commercial_contract_id).maybeSingle(),
    db.from("commercial_service_plans").select("service_type_id").eq("contract_id", job.commercial_contract_id),
    db.from("provider_certifications").select("provider_id, tier").in("provider_id", candidateProviderIds).eq("category", job.category).eq("is_active", true),
    db.from("jobs").select("provider_id").in("provider_id", candidateProviderIds).in("status", ["scheduled", "en_route", "in_progress"]),
  ]);

  const certifiedProviderIds = new Set(
    (certifications ?? []).filter((c) => MIN_CERTIFIED_TIER.includes(c.tier)).map((c) => c.provider_id)
  );

  const workloadByProvider = new Map<string, number>();
  for (const row of activeJobCounts ?? []) {
    workloadByProvider.set(row.provider_id, (workloadByProvider.get(row.provider_id) ?? 0) + 1);
  }

  const ineligibleReasons: Record<string, string> = {};
  const eligibleProviderIds = candidateProviderIds.filter((id) => {
    if (!certifiedProviderIds.has(id)) {
      ineligibleReasons[id] = "Not certified Gold/Elite for this commercial job's category";
      return false;
    }
    if ((workloadByProvider.get(id) ?? 0) >= 5) {
      ineligibleReasons[id] = "At capacity (5+ concurrent active jobs)";
      return false;
    }
    return true;
  });

  const slaDeadline = contract?.sla_response_minutes
    ? new Date(new Date(job.created_at).getTime() + contract.sla_response_minutes * 60 * 1000).toISOString()
    : null;

  return {
    isCommercial: true,
    contractId: job.commercial_contract_id,
    requiredServiceTypeIds: (servicePlans ?? []).map((p) => p.service_type_id),
    slaDeadline,
    eligibleProviderIds,
    ineligibleReasons,
  };
}
