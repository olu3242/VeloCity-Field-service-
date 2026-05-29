import "@/runtime/server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { getGlobalInfrastructureOsSummary } from "@/runtime/infrastructure/global-os";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severity(score: number) {
  if (score >= 75) return "critical";
  if (score >= 45) return "warning";
  return "info";
}

const planetaryTables = [
  "planetary_operations_grid",
  "civilization_workforce_network",
  "continuity_operations",
  "planetary_economic_models",
  "resilience_intelligence",
  "civilization_service_networks",
  "emergency_operations_network",
  "planetary_infrastructure_models",
  "stabilization_models",
  "civilization_operations_fabric",
  "planetary_operations_snapshots",
] as const;

export async function getPlanetaryOperationsSummary(tenantId: string) {
  const db = getAdminClient();
  const [global, ...results] = await Promise.all([
    getGlobalInfrastructureOsSummary(tenantId),
    ...planetaryTables.map((table) =>
      db.from(table).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
    ),
  ]);

  return {
    global,
    operationsGrid: results[0].data ?? [],
    workforceNetwork: results[1].data ?? [],
    continuity: results[2].data ?? [],
    economicModels: results[3].data ?? [],
    resilience: results[4].data ?? [],
    serviceNetworks: results[5].data ?? [],
    emergencyNetwork: results[6].data ?? [],
    infrastructureModels: results[7].data ?? [],
    stabilization: results[8].data ?? [],
    operationsFabric: results[9].data ?? [],
    snapshots: results[10].data ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function generatePlanetaryOperationsCycle(tenantId: string) {
  const db = getAdminClient();
  const global = await getGlobalInfrastructureOsSummary(tenantId);
  const correlationId = createCorrelationId("planet");
  const latestCloud = global.cloud.snapshots[0] as { systemic_risk_score?: number } | undefined;
  const inheritedRisk = clamp(Number(latestCloud?.systemic_risk_score ?? 0));
  const queue = global.cloud.national.operations.health.queue;
  const systemicRisk = clamp(inheritedRisk + queue.failed * 6 + queue.deadLetters * 10);
  const sev = severity(systemicRisk);
  const confidence = global.cloud.national.operations.health.status === "healthy" ? 0.74 : 0.55;

  const base = {
    tenant_id: tenantId,
    severity: sev,
    risk_score: systemicRisk,
    confidence,
    governance_state: "supervised",
    escalation_state: "controlled",
    correlation_id: correlationId,
  };

  const records = [
    {
      table: "planetary_operations_grid",
      row: {
        ...base,
        subject_type: "planetary_grid",
        model_type: "intercontinental_service_routing",
        score: clamp(100 - systemicRisk),
        capacity_score: clamp(100 - queue.pending),
        recommendation: "Keep planetary routing as supervised continuity planning until regional governance and SLA controls are proven.",
        payload: { routingMode: "governed", queue },
      },
    },
    {
      table: "civilization_workforce_network",
      row: {
        ...base,
        subject_type: "workforce_coordination",
        model_type: "global_skill_density",
        score: 70,
        capacity_score: 68,
        recommendation: "Use workforce shortage intelligence for mobilization planning; require approval before cross-region deployment.",
        payload: { capabilities: ["emergency_mobilization", "skill_density", "continuity_planning"] },
      },
    },
    {
      table: "continuity_operations",
      row: {
        ...base,
        subject_type: "infrastructure_continuity",
        model_type: "critical_service_failover",
        score: clamp(92 - systemicRisk / 2),
        continuity_score: clamp(95 - systemicRisk),
        recommendation: "Prioritize critical-service failover maps for dispatch, payout, automation, notification, and governance systems.",
        payload: { dependencies: ["dispatch", "payouts", "automation", "notifications", "governance"] },
      },
    },
    {
      table: "planetary_economic_models",
      row: {
        ...base,
        subject_type: "service_economy",
        model_type: "global_demand_forecast",
        score: 66,
        recommendation: "Treat planetary economic intelligence as forecasting only until monetization and compliance controls are mature.",
        payload: { forecasting: ["pricing", "liquidity", "demand", "investment"] },
      },
    },
    {
      table: "resilience_intelligence",
      row: {
        ...base,
        subject_type: "resilience",
        model_type: "systemic_degradation_detection",
        score: clamp(100 - systemicRisk),
        continuity_score: clamp(100 - systemicRisk),
        recommendation: "Trigger human-reviewed recovery plans when systemic risk crosses warning thresholds.",
        payload: { selfHealing: "supervised", failover: "approval_gated" },
      },
    },
    {
      table: "emergency_operations_network",
      row: {
        ...base,
        subject_type: "emergency_operations",
        model_type: "crisis_coordination",
        score: clamp(85 - systemicRisk / 3),
        priority: systemicRisk >= 45 ? 90 : 55,
        recommendation: "Maintain centralized escalation authority for disaster response and critical infrastructure routing.",
        payload: { escalationAuthority: "centralized", crisisMode: "governed" },
      },
    },
    {
      table: "civilization_operations_fabric",
      row: {
        ...base,
        subject_type: "operations_fabric",
        model_type: "civilization_scale_coordination",
        score: clamp(100 - systemicRisk),
        continuity_score: clamp(100 - systemicRisk),
        recommendation: "Use this fabric to coordinate dependency-aware operations, not to decentralize infrastructure authority.",
        payload: { fabric: "event_driven", authority: "centralized", auditability: "required" },
      },
    },
  ];

  const inserted = await Promise.all(
    records.map(({ table, row }) => db.from(table).insert(row as Record<string, unknown>).select("*").single())
  );
  const errors = inserted.map((result) => result.error).filter(Boolean);
  if (errors.length) throw errors[0];

  const snapshot = await db.from("planetary_operations_snapshots").insert({
    tenant_id: tenantId,
    operations_grid_score: clamp(100 - systemicRisk),
    workforce_score: 70,
    continuity_score: clamp(95 - systemicRisk),
    resilience_score: clamp(100 - systemicRisk),
    emergency_readiness_score: clamp(85 - systemicRisk / 3),
    systemic_risk_score: systemicRisk,
    topology: {
      globalRisk: inheritedRisk,
      queue,
      governance: "centralized",
      autonomy: "supervised",
    },
    recommendations: records.map(({ row }) => row.recommendation),
    correlation_id: correlationId,
  }).select("*").single();
  if (snapshot.error) throw snapshot.error;

  return { correlationId, systemicRisk, recordsCreated: inserted.length + 1, snapshot: snapshot.data };
}
