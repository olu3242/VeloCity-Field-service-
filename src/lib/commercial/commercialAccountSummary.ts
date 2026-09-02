// Commercial Account Summary (Batch X+3, Phase 6) — Commercial Service
// Operations read-time view: locations, contracts, service plans, and
// realized revenue per account, for Command Center and commercial
// experience surfaces.

import { getAdminClient } from "@/lib/supabase/admin";

export interface CommercialAccountSummary {
  accountId: string;
  name: string;
  status: string;
  locationCount: number;
  activeContracts: Array<{
    contractId: string;
    contractType: string;
    status: string;
    contractValueCents: number;
    billingFrequency: string;
    startDate: string;
    endDate: string | null;
    servicePlans: Array<{ serviceTypeName: string; includedUsesPerPeriod: number | null; period: string }>;
  }>;
  realizedRevenueCents: number;
  jobCount: number;
}

export async function computeCommercialAccountSummary(accountId: string): Promise<CommercialAccountSummary | null> {
  const db = getAdminClient();

  const { data: account } = await db.from("commercial_accounts").select("id, name, status").eq("id", accountId).maybeSingle();
  if (!account) return null;

  const [{ data: locations }, { data: contracts }, { data: revenueRows }, { data: jobs }] = await Promise.all([
    db.from("commercial_locations").select("id").eq("account_id", accountId),
    db
      .from("commercial_contracts")
      .select("id, contract_type, status, contract_value_cents, billing_frequency, start_date, end_date")
      .eq("account_id", accountId)
      .in("status", ["active", "at_risk"]),
    db.from("revenue_records").select("gross_amount_cents").eq("commercial_account_id", accountId),
    db.from("jobs").select("id").eq("commercial_account_id", accountId),
  ]);

  const activeContracts = [];
  for (const contract of contracts ?? []) {
    const { data: plans } = await db
      .from("commercial_service_plans")
      .select("included_uses_per_period, period, service_types(name)")
      .eq("contract_id", contract.id);

    activeContracts.push({
      contractId: contract.id,
      contractType: contract.contract_type,
      status: contract.status,
      contractValueCents: contract.contract_value_cents,
      billingFrequency: contract.billing_frequency,
      startDate: contract.start_date,
      endDate: contract.end_date,
      servicePlans: (plans ?? []).map((p: any) => ({
        serviceTypeName: p.service_types?.name ?? "Unknown",
        includedUsesPerPeriod: p.included_uses_per_period,
        period: p.period,
      })),
    });
  }

  return {
    accountId: account.id,
    name: account.name,
    status: account.status,
    locationCount: locations?.length ?? 0,
    activeContracts,
    realizedRevenueCents: (revenueRows ?? []).reduce((sum, r) => sum + (r.gross_amount_cents ?? 0), 0),
    jobCount: jobs?.length ?? 0,
  };
}

export async function listCommercialAccounts(): Promise<Array<{ id: string; name: string; status: string }>> {
  const db = getAdminClient();
  const { data } = await db.from("commercial_accounts").select("id, name, status").order("created_at", { ascending: false });
  return data ?? [];
}
