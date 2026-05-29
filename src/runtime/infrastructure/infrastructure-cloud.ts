import "@/runtime/server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { getEcosystemEconomySummary } from "@/runtime/ecosystem/economy";
import { getNationalOperationsSummary } from "@/runtime/intelligence/national-operations";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severity(score: number) {
  if (score >= 75) return "critical";
  if (score >= 45) return "warning";
  return "info";
}

export async function getInfrastructureCloudSummary(tenantId: string) {
  const db = getAdminClient();
  const tables = [
    "infrastructure_runtime_clusters",
    "national_service_grid",
    "ai_operations_exchange",
    "national_workforce_liquidity",
    "resource_allocation_models",
    "national_operations_fabric",
    "fabric_health_metrics",
    "infrastructure_os_snapshots",
  ];
  const [national, ecosystem, ...results] = await Promise.all([
    getNationalOperationsSummary(tenantId),
    getEcosystemEconomySummary(tenantId),
    ...tables.map((table) =>
      db.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
    ),
  ]);

  return {
    national,
    ecosystem,
    runtimeClusters: results[0].data ?? [],
    serviceGrid: results[1].data ?? [],
    operationsExchange: results[2].data ?? [],
    workforceLiquidity: results[3].data ?? [],
    resourceAllocation: results[4].data ?? [],
    operationsFabric: results[5].data ?? [],
    fabricHealth: results[6].data ?? [],
    snapshots: results[7].data ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateInfrastructureCloudCycle(tenantId: string) {
  const db = getAdminClient();
  const summary = await getNationalOperationsSummary(tenantId);
  const correlationId = createCorrelationId("cloud");
  const queue = summary.operations.health.queue;
  const risk = clamp(
    (summary.snapshots[0]?.risk_score ? Number(summary.snapshots[0].risk_score) : 0) +
    queue.pending +
    queue.failed * 8 +
    queue.deadLetters * 12
  );
  const sev = severity(risk);
  const confidence = summary.operations.health.status === "healthy" ? 0.8 : 0.62;

  const records = [
    {
      table: "infrastructure_runtime_clusters",
      row: {
        tenant_id: tenantId,
        subject_type: "runtime_cluster",
        model_type: "dynamic_orchestration_scaling",
        severity: sev,
        score: clamp(100 - risk),
        capacity_score: clamp(100 - queue.pending),
        confidence,
        recommendation: risk >= 45
          ? "Shift non-critical orchestration work to overflow capacity and reserve primary runtime for SLA-sensitive queues."
          : "Runtime cluster pressure is inside supervised operating thresholds.",
        payload: { queue, runtimeStatus: summary.operations.health.status },
        evidence: { source: "national_operations_summary" },
        correlation_id: correlationId,
      },
    },
    {
      table: "national_service_grid",
      row: {
        tenant_id: tenantId,
        subject_type: "service_grid",
        model_type: "cross_territory_balancing",
        severity: sev,
        score: clamp(100 - risk / 2),
        capacity_score: clamp(100 - summary.operations.metrics.providerOffersOpen * 2),
        liquidity_score: clamp(70 - summary.operations.metrics.providerOffersOpen),
        confidence,
        recommendation: "Use service grid balancing for supervised overflow, emergency redistribution, and territory support exchanges.",
        payload: { providerOffersOpen: summary.operations.metrics.providerOffersOpen },
        evidence: { generatedFrom: "operations_command_center" },
        correlation_id: correlationId,
      },
    },
    {
      table: "ai_operations_exchange",
      row: {
        tenant_id: tenantId,
        subject_type: "operations_exchange",
        model_type: "resource_allocation_market",
        severity: "info",
        score: 68,
        liquidity_score: 66,
        confidence: 0.7,
        recommendation: "Keep operational resource bids in observe-only mode until financial controls and SLA governance approve allocation.",
        payload: { exchangeTypes: ["capacity", "workforce", "routing", "infrastructure"] },
        evidence: { governance: "centralized" },
        correlation_id: correlationId,
      },
    },
    {
      table: "national_workforce_liquidity",
      row: {
        tenant_id: tenantId,
        subject_type: "workforce_liquidity_cloud",
        model_type: "labor_imbalance_forecast",
        severity: summary.operations.metrics.providerOffersOpen > 20 ? "warning" : "info",
        score: clamp(100 - summary.operations.metrics.providerOffersOpen * 2),
        liquidity_score: clamp(80 - summary.operations.metrics.providerOffersOpen),
        confidence,
        recommendation: "Route provider mobility recommendations through territory governance before cross-market deployment.",
        payload: { providersActive: summary.operations.metrics.providersActive },
        evidence: { supervised: true },
        correlation_id: correlationId,
      },
    },
    {
      table: "national_operations_fabric",
      row: {
        tenant_id: tenantId,
        subject_type: "operations_fabric",
        model_type: "dependency_aware_coordination",
        severity: sev,
        score: clamp(100 - risk),
        confidence,
        recommendation: "Maintain dependency-aware routing across automation, dispatch, payout, workforce, and governance systems.",
        payload: {
          dependencies: ["automation", "dispatch", "payouts", "workforce", "governance", "ecosystem"],
        },
        evidence: { correlationId },
        correlation_id: correlationId,
      },
    },
  ];

  const inserted = await Promise.all(
    records.map(({ table, row }) => db.from(table).insert(row as Record<string, unknown>).select("*").single())
  );
  const errors = inserted.map((result) => result.error).filter(Boolean);
  if (errors.length) throw errors[0];

  const snapshot = await db.from("infrastructure_os_snapshots").insert({
    tenant_id: tenantId,
    infrastructure_score: clamp(100 - risk),
    service_grid_score: clamp(100 - risk / 2),
    liquidity_score: clamp(80 - summary.operations.metrics.providerOffersOpen),
    governance_score: 88,
    systemic_risk_score: risk,
    topology: {
      queue,
      serviceGrid: "supervised",
      operationsExchange: "observe_only",
      fabric: "centralized",
    },
    recommendations: records.map(({ row }) => row.recommendation),
    correlation_id: correlationId,
  }).select("*").single();
  if (snapshot.error) throw snapshot.error;

  return { correlationId, risk, recordsCreated: inserted.length + 1, snapshot: snapshot.data };
}
