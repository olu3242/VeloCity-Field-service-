import "@/runtime/server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { getInfrastructureCloudSummary } from "@/runtime/infrastructure/infrastructure-cloud";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

const globalTables = [
  "global_territory_federations",
  "global_service_economy",
  "governance_ai_models",
  "global_workforce_network",
  "international_territories",
  "infrastructure_diplomacy_models",
  "global_liquidity_networks",
  "autonomous_compliance_models",
  "infrastructure_intelligence_core",
  "global_governance_fabric",
] as const;

export async function getGlobalInfrastructureOsSummary(tenantId: string) {
  const db = getAdminClient();
  const [cloud, ...results] = await Promise.all([
    getInfrastructureCloudSummary(tenantId),
    ...globalTables.map((table) =>
      db.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
    ),
  ]);

  return {
    cloud,
    territoryFederations: results[0].data ?? [],
    serviceEconomy: results[1].data ?? [],
    governanceAi: results[2].data ?? [],
    workforceNetwork: results[3].data ?? [],
    internationalTerritories: results[4].data ?? [],
    diplomacy: results[5].data ?? [],
    liquidity: results[6].data ?? [],
    compliance: results[7].data ?? [],
    intelligenceCore: results[8].data ?? [],
    governanceFabric: results[9].data ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateGlobalInfrastructureOsCycle(tenantId: string) {
  const db = getAdminClient();
  const cloud = await getInfrastructureCloudSummary(tenantId);
  const correlationId = createCorrelationId("gios");
  const latest = cloud.snapshots[0] as { systemic_risk_score?: number } | undefined;
  const systemicRisk = Math.max(0, Math.min(100, Math.round(Number(latest?.systemic_risk_score ?? 0))));
  const confidence = cloud.national.operations.health.status === "healthy" ? 0.76 : 0.58;

  const base = {
    tenant_id: tenantId,
    severity: systemicRisk > 50 ? "warning" : "info",
    confidence,
    governance_state: "supervised",
    sla_state: "governed",
    correlation_id: correlationId,
  };

  const records = [
    {
      table: "global_territory_federations",
      row: {
        ...base,
        subject_type: "global_federation",
        model_type: "international_operational_coordination",
        score: 72,
        recommendation: "Keep international federation in governance-gated mode until regional compliance models are approved.",
        payload: { federationMode: "centralized", crossBorderSupport: "governed" },
      },
    },
    {
      table: "global_service_economy",
      row: {
        ...base,
        subject_type: "global_service_economy",
        model_type: "cross_market_service_balancing",
        score: 69,
        liquidity_score: 64,
        recommendation: "Model cross-market service flows before enabling external service economy participation.",
        payload: { exchangeState: "forecast_only", liquidityControls: true },
      },
    },
    {
      table: "governance_ai_models",
      row: {
        ...base,
        subject_type: "infrastructure_governance_ai",
        model_type: "policy_prediction",
        score: 82,
        recommendation: "Route governance AI outputs through approval thresholds, explainability, and immutable audit logs.",
        payload: { approvalsRequired: true, explainability: true, auditability: true },
      },
    },
    {
      table: "global_workforce_network",
      row: {
        ...base,
        subject_type: "global_workforce",
        model_type: "mobility_coordination",
        score: 66,
        liquidity_score: 61,
        recommendation: "Use workforce mobility intelligence for shortage planning only until localized labor rules are configured.",
        payload: { mobility: "forecasting", emergencyRedistribution: "governed" },
      },
    },
    {
      table: "autonomous_compliance_models",
      row: {
        ...base,
        subject_type: "global_compliance",
        model_type: "regulatory_risk_forecast",
        score: 85,
        recommendation: "Treat compliance automation as supervised monitoring; block autonomous policy changes without approval.",
        payload: { complianceMode: "supervised", policyChanges: "approval_required" },
      },
    },
    {
      table: "infrastructure_intelligence_core",
      row: {
        ...base,
        subject_type: "infrastructure_intelligence_os",
        model_type: "systemic_operational_analysis",
        score: Math.max(0, 100 - systemicRisk),
        recommendation: "Use systemic-risk signals to prioritize infrastructure routing, liquidity movement, and escalation planning.",
        payload: { systemicRisk, cloudSnapshot: latest ?? null },
      },
    },
    {
      table: "global_governance_fabric",
      row: {
        ...base,
        subject_type: "global_governance_fabric",
        model_type: "federated_policy_harmonization",
        score: 80,
        recommendation: "Preserve unified authority across federation, compliance, escalation, and infrastructure policy surfaces.",
        payload: { governanceAuthority: "centralized", escalationNetwork: "global" },
      },
    },
  ];

  const inserted = await Promise.all(
    records.map(({ table, row }) => db.from(table).insert(row as Record<string, unknown>).select("*").single())
  );
  const errors = inserted.map((result) => result.error).filter(Boolean);
  if (errors.length) throw errors[0];

  return { correlationId, systemicRisk, recordsCreated: inserted.length, records: inserted.map((result) => result.data) };
}
