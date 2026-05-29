import "@/runtime/server-only";
import { scoreEventAnomaly } from "@/lib/event-intelligence/anomaly-scorer";
import { getAdminClient } from "@/lib/supabase/admin";

export async function recordEventIntelligence(input: {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}) {
  const db = getAdminClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await db
    .from("automation_events")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .eq("event_type", input.eventType)
    .gte("created_at", since);

  const payloadSize = JSON.stringify(input.payload).length;
  const anomaly = scoreEventAnomaly(input.eventType, input.tenantId, {
    frequency: count ?? 0,
    expectedFrequency: 25,
    payloadSize,
  });

  const score = anomaly?.anomalyScore ?? Math.min(0.25, (count ?? 0) / 100);
  const severity = score >= 0.8 ? "critical" : score >= 0.45 ? "warning" : "info";

  await db.from("event_intelligence_scores").insert({
    tenant_id: input.tenantId,
    event_type: input.eventType,
    score,
    severity,
    reason: anomaly?.reason ?? "Within expected event envelope",
    frequency: count ?? 0,
    expected_frequency: 25,
    payload_size: payloadSize,
    correlation_id: input.correlationId ?? null,
  }).then(() => null);

  if (severity !== "info") {
    await db.from("operational_alerts").insert({
      tenant_id: input.tenantId,
      severity,
      system: "event_intelligence",
      title: `${input.eventType} anomaly detected`,
      detail: anomaly?.reason ?? "Event pattern exceeded expected envelope",
      correlation_id: input.correlationId ?? null,
      metadata: { event_type: input.eventType, score, frequency: count ?? 0, payload_size: payloadSize },
    }).then(() => null);
  }

  return { score, severity, anomaly };
}

export async function getEventIntelligenceSummary(tenantId: string) {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await getAdminClient()
    .from("event_intelligence_scores")
    .select("event_type, score, severity, frequency, payload_size, reason, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = data ?? [];
  return {
    total24h: rows.length,
    critical24h: rows.filter((row) => row.severity === "critical").length,
    warning24h: rows.filter((row) => row.severity === "warning").length,
    topEvents: rows
      .slice()
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
      .slice(0, 20),
  };
}
