// Commercial Revenue Intelligence (Batch X+3, Phase 7) — FINN Commercial
// Revenue Intelligence. Read-time computation over the same revenue_records
// ledger used by every other revenue metric in the platform (Batch X+1/X+2),
// filtered by commercial_account_id, plus contract attainment and renewal
// pipeline from commercial_contracts. No second revenue ledger.

import { getAdminClient } from "@/lib/supabase/admin";

export interface CommercialContractAttainment {
  contractId: string;
  accountName: string;
  contractValueCents: number;
  realizedRevenueCents: number;
  attainmentRate: number;
  status: string;
}

export interface CommercialRenewalPipelineItem {
  contractId: string;
  accountName: string;
  endDate: string | null;
  contractValueCents: number;
}

export interface CommercialRevenueReport {
  totalCommercialRevenueCents: number;
  activeContractValueCents: number;
  contractAttainment: CommercialContractAttainment[];
  atRiskContracts: CommercialContractAttainment[];
  renewalPipeline: CommercialRenewalPipelineItem[];
}

const RENEWAL_WINDOW_DAYS = 30;

export async function computeCommercialRevenueIntelligence(): Promise<CommercialRevenueReport> {
  const db = getAdminClient();

  const { data: contracts } = await db
    .from("commercial_contracts")
    .select("id, status, contract_value_cents, start_date, end_date, account_id, commercial_accounts(name)")
    .in("status", ["active", "at_risk"]);

  const { data: revenueRows } = await db.from("revenue_records").select("gross_amount_cents, commercial_account_id").not("commercial_account_id", "is", null);

  const revenueByAccount = new Map<string, number>();
  for (const row of revenueRows ?? []) {
    revenueByAccount.set(row.commercial_account_id, (revenueByAccount.get(row.commercial_account_id) ?? 0) + (row.gross_amount_cents ?? 0));
  }

  const contractAttainment: CommercialContractAttainment[] = (contracts ?? []).map((c: any) => {
    const realizedRevenueCents = revenueByAccount.get(c.account_id) ?? 0;
    const attainmentRate = c.contract_value_cents > 0 ? realizedRevenueCents / c.contract_value_cents : 0;
    return {
      contractId: c.id,
      accountName: c.commercial_accounts?.name ?? "Unknown",
      contractValueCents: c.contract_value_cents,
      realizedRevenueCents,
      attainmentRate,
      status: c.status,
    };
  });

  const totalCommercialRevenueCents = Array.from(revenueByAccount.values()).reduce((sum, v) => sum + v, 0);
  const activeContractValueCents = (contracts ?? []).reduce((sum, c) => sum + (c.contract_value_cents ?? 0), 0);

  const atRiskContracts = contractAttainment.filter((c) => c.status === "at_risk" || c.attainmentRate < 0.5);

  const renewalWindowEnd = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const renewalPipeline: CommercialRenewalPipelineItem[] = (contracts ?? [])
    .filter((c: any) => c.end_date && c.end_date <= renewalWindowEnd)
    .map((c: any) => ({
      contractId: c.id,
      accountName: c.commercial_accounts?.name ?? "Unknown",
      endDate: c.end_date,
      contractValueCents: c.contract_value_cents,
    }));

  return {
    totalCommercialRevenueCents,
    activeContractValueCents,
    contractAttainment,
    atRiskContracts,
    renewalPipeline,
  };
}
