import { getOperationsCommandCenter } from "@/runtime/intelligence/operations-command-center";
import { getEventIntelligenceSummary } from "@/runtime/intelligence/event-intelligence";
import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

function severityFromStatus(status: string) {
  if (status === "critical" || status === "down") return "critical";
  if (status === "degraded" || status === "warning") return "warning";
  return "info";
}

export async function generateAutonomousRecommendations(tenantId: string) {
  const correlationId = createCorrelationId("rec");
  const [ops, events] = await Promise.all([
    getOperationsCommandCenter(tenantId),
    getEventIntelligenceSummary(tenantId).catch(() => ({ critical24h: 0, warning24h: 0, topEvents: [] })),
  ]);

  const recommendations = [
    ...ops.pulse.recommendations.map((recommendation) => ({
      source: "operations_pulse",
      category: "operations",
      severity: severityFromStatus(ops.pulse.overallStatus),
      title: "Operations pulse action",
      recommendation,
      confidence: 0.82,
      metadata: { pulse: ops.pulse },
    })),
    ...ops.health.warnings.map((warning) => ({
      source: "runtime_health",
      category: "runtime",
      severity: severityFromStatus(ops.health.status),
      title: "Runtime health warning",
      recommendation: warning,
      confidence: 0.9,
      metadata: { health_status: ops.health.status },
    })),
    ...(events.critical24h || events.warning24h ? [{
      source: "event_intelligence",
      category: "event_bus",
      severity: events.critical24h ? "critical" : "warning",
      title: "Event anomaly review",
      recommendation: "Review anomalous event patterns and throttle noisy emitters if needed.",
      confidence: 0.78,
      metadata: events,
    }] : []),
  ];

  if (!recommendations.length) return { created: 0, recommendations: [] };

  const rows = recommendations.map((item) => ({
    tenant_id: tenantId,
    ...item,
    correlation_id: correlationId,
  }));

  const { data, error } = await getAdminClient()
    .from("autonomous_recommendations")
    .insert(rows)
    .select("*");
  if (error) throw error;

  return { created: data?.length ?? 0, recommendations: data ?? [], correlationId };
}

export async function getAutonomousRecommendations(tenantId: string) {
  const { data, error } = await getAdminClient()
    .from("autonomous_recommendations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
