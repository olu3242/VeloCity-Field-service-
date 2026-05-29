import "@/runtime/server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { getOperationsCommandCenter } from "@/runtime/intelligence/operations-command-center";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

type Severity = "info" | "warning" | "critical";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severityFromScore(score: number): Severity {
  if (score >= 75) return "critical";
  if (score >= 45) return "warning";
  return "info";
}

function riskFromOps(ops: Awaited<ReturnType<typeof getOperationsCommandCenter>>) {
  const queueRisk = ops.health.queue.failed * 8 + ops.health.queue.deadLetters * 12 + ops.health.queue.pending;
  const dispatchRisk = ops.metrics.providerOffersOpen * 2;
  const latencyRisk = ops.metrics.automationLatencyAvgMs24h / 1000;
  const disputeRisk = ops.metrics.openDisputes * 5;
  return clampScore(queueRisk + dispatchRisk + latencyRisk + disputeRisk);
}

export async function getNationalOperationsSummary(tenantId: string) {
  const db = getAdminClient();
  const tables = [
    "predictive_operational_insights",
    "operational_recommendations",
    "national_risk_models",
    "territory_risk_heatmaps",
    "national_workforce_metrics",
    "financial_risk_models",
    "executive_operations_snapshots",
  ];

  const [ops, ...results] = await Promise.all([
    getOperationsCommandCenter(tenantId),
    ...tables.map((table) =>
      db.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
    ),
  ]);

  return {
    operations: ops,
    predictiveInsights: results[0].data ?? [],
    recommendations: results[1].data ?? [],
    nationalRisk: results[2].data ?? [],
    territoryHeatmaps: results[3].data ?? [],
    workforce: results[4].data ?? [],
    financialRisk: results[5].data ?? [],
    snapshots: results[6].data ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateNationalOperationsCycle(tenantId: string) {
  const db = getAdminClient();
  const ops = await getOperationsCommandCenter(tenantId);
  const correlationId = createCorrelationId("natops");
  const riskScore = riskFromOps(ops);
  const severity = severityFromScore(riskScore);
  const confidence = ops.health.status === "healthy" ? 0.82 : 0.64;

  const records = [
    {
      table: "predictive_operational_insights",
      row: {
        tenant_id: tenantId,
        subject_type: "national_operations",
        model_type: "sla_degradation_forecast",
        severity,
        score: riskScore,
        confidence,
        recommendation: riskScore >= 45
          ? "Reserve dispatch capacity for SLA-sensitive jobs and review queue retry pressure."
          : "Maintain current operational posture and continue monitoring queue pressure.",
        payload: {
          queue: ops.health.queue,
          automationLatencyAvgMs24h: ops.metrics.automationLatencyAvgMs24h,
          providerOffersOpen: ops.metrics.providerOffersOpen,
        },
        evidence: { healthStatus: ops.health.status, alerts: ops.alerts.slice(0, 5) },
        correlation_id: correlationId,
      },
    },
    {
      table: "national_risk_models",
      row: {
        tenant_id: tenantId,
        subject_type: "national_network",
        model_type: "operational_risk_score",
        severity,
        score: riskScore,
        confidence,
        recommendation: "Use this score as supervised executive prioritization, not autonomous authority.",
        payload: { riskScore, health: ops.health.status },
        evidence: { pulse: ops.pulse },
        correlation_id: correlationId,
      },
    },
    {
      table: "national_workforce_metrics",
      row: {
        tenant_id: tenantId,
        subject_type: "workforce",
        model_type: "capacity_forecast",
        severity: ops.metrics.providerOffersOpen > 20 ? "warning" : "info",
        score: clampScore(100 - ops.metrics.providerOffersOpen * 2),
        confidence,
        recommendation: ops.metrics.providerOffersOpen > 20
          ? "Open overflow routing and incentive review for high-offer territories."
          : "Provider load is within the supervised operating band.",
        payload: { providersActive: ops.metrics.providersActive, providerOffersOpen: ops.metrics.providerOffersOpen },
        evidence: { generatedFrom: "operations_command_center" },
        correlation_id: correlationId,
      },
    },
    {
      table: "financial_risk_models",
      row: {
        tenant_id: tenantId,
        subject_type: "financial_operations",
        model_type: "margin_and_reserve_risk",
        severity: ops.health.payouts.failed > 0 ? "warning" : "info",
        score: clampScore(ops.health.payouts.failed * 15 + ops.health.payouts.queued * 3),
        confidence,
        recommendation: ops.health.payouts.failed > 0
          ? "Review payout failures before approving new instant payout exposure."
          : "Payout and reserve pressure is inside the supervised range.",
        payload: { payouts: ops.health.payouts, gmvCents30d: ops.metrics.gmvCents30d },
        evidence: { healthStatus: ops.health.status },
        correlation_id: correlationId,
      },
    },
    {
      table: "operational_recommendations",
      row: {
        tenant_id: tenantId,
        subject_type: "executive_operations",
        model_type: "supervised_action_plan",
        severity,
        score: riskScore,
        confidence,
        recommendation: "Prioritize SLA risk, dispatch liquidity, workforce load, and payout stability in that order.",
        payload: {
          recommendationTypes: [
            "sla_optimization",
            "dispatch_optimization",
            "workforce_balancing",
            "profitability_optimization",
          ],
        },
        evidence: { riskScore, correlationId },
        correlation_id: correlationId,
      },
    },
  ];

  const inserted = await Promise.all(
    records.map(({ table, row }) => db.from(table).insert(row as Record<string, unknown>).select("*").single())
  );
  const errors = inserted.map((result) => result.error).filter(Boolean);
  if (errors.length) throw errors[0];

  const snapshot = await db.from("executive_operations_snapshots").insert({
    tenant_id: tenantId,
    health_score: clampScore(100 - riskScore),
    risk_score: riskScore,
    profitability_score: clampScore(100 - ops.health.payouts.failed * 15),
    workforce_score: clampScore(100 - ops.metrics.providerOffersOpen * 2),
    ecosystem_score: ops.health.status === "down" ? 25 : 75,
    summary: {
      health: ops.health.status,
      metrics: ops.metrics,
      riskScore,
    },
    recommendations: records.map(({ row }) => row.recommendation),
    correlation_id: correlationId,
  }).select("*").single();
  if (snapshot.error) throw snapshot.error;

  return {
    correlationId,
    riskScore,
    severity,
    recordsCreated: inserted.length + 1,
    snapshot: snapshot.data,
  };
}
