import "@/runtime/server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

const economyTables = [
  "ecosystem_partners",
  "partner_operational_profiles",
  "national_provider_marketplace",
  "provider_financial_profiles",
  "territory_economic_models",
  "market_liquidity_scores",
  "infrastructure_products",
  "platform_usage_billing",
  "infrastructure_exchange",
] as const;

export async function getEcosystemEconomySummary(tenantId: string) {
  const db = getAdminClient();
  const results = await Promise.all(
    economyTables.map((table) =>
      db.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
    )
  );

  return {
    partners: results[0].data ?? [],
    partnerProfiles: results[1].data ?? [],
    workforceLiquidity: results[2].data ?? [],
    providerFinance: results[3].data ?? [],
    territoryEconomics: results[4].data ?? [],
    liquidityScores: results[5].data ?? [],
    infrastructureProducts: results[6].data ?? [],
    usageBilling: results[7].data ?? [],
    exchange: results[8].data ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateEcosystemEconomyCycle(tenantId: string) {
  const db = getAdminClient();
  const correlationId = createCorrelationId("eco");
  const base = {
    tenant_id: tenantId,
    status: "active",
    severity: "info",
    confidence: 0.72,
    governance_state: "supervised",
    correlation_id: correlationId,
  };

  const records = [
    {
      table: "ecosystem_partners",
      row: {
        ...base,
        subject_type: "partner_network",
        model_type: "ecosystem_governance",
        score: 70,
        recommendation: "Keep partner integration expansion behind API permissions, audit logs, and usage metering.",
        payload: { partnerOnboarding: "supervised", governance: "centralized" },
      },
    },
    {
      table: "market_liquidity_scores",
      row: {
        ...base,
        subject_type: "workforce_liquidity",
        model_type: "national_workforce_exchange",
        score: 68,
        recommendation: "Use territory workforce exchange only for admin-approved overflow and emergency pooling.",
        payload: { mobility: "cross_territory", approvalRequired: true },
      },
    },
    {
      table: "provider_financial_profiles",
      row: {
        ...base,
        subject_type: "embedded_finance",
        model_type: "provider_financial_health",
        score: 65,
        recommendation: "Gate advances and instant payout expansion behind payout health and reserve coverage.",
        payload: { financialProducts: ["instant_payouts", "reserve_backed_advances", "equipment_financing"] },
      },
    },
    {
      table: "infrastructure_products",
      row: {
        ...base,
        subject_type: "infrastructure_monetization",
        model_type: "usage_based_operations",
        score: 74,
        recommendation: "Meter API, AI, dispatch, and automation usage before enabling external billing.",
        payload: { meteredProducts: ["api", "ai", "dispatch", "automation", "territory_intelligence"] },
      },
    },
    {
      table: "infrastructure_exchange",
      row: {
        ...base,
        subject_type: "infrastructure_exchange",
        model_type: "resource_allocation",
        score: 62,
        recommendation: "Launch resource exchange in observe-only mode until liquidity and payout controls are proven.",
        payload: { exchangeModes: ["territory_resources", "provider_capacity", "workforce_pooling"] },
      },
    },
  ];

  const inserted = await Promise.all(
    records.map(({ table, row }) => db.from(table).insert(row as Record<string, unknown>).select("*").single())
  );
  const errors = inserted.map((result) => result.error).filter(Boolean);
  if (errors.length) throw errors[0];

  return {
    correlationId,
    recordsCreated: inserted.length,
    records: inserted.map((result) => result.data),
  };
}
