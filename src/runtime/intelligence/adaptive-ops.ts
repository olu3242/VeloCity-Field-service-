import "@/runtime/server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { getOperationsCommandCenter } from "@/runtime/intelligence/operations-command-center";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export async function generateAdaptiveOptimization(tenantId: string) {
  const ops = await getOperationsCommandCenter(tenantId);
  const correlationId = createCorrelationId("opt");
  const loops = [];

  if (ops.health.queue.failed > 0 || ops.health.queue.deadLetters > 0) {
    loops.push({
      loop_type: "automation_recovery",
      target_type: "automation_queue",
      recommendation: "Prioritize DLQ replay and reduce retry concurrency until failure rate normalizes.",
      expected_impact: { failed: ops.health.queue.failed, deadLetters: ops.health.queue.deadLetters, riskReduction: 0.25 },
    });
  }

  if (ops.metrics.automationLatencyAvgMs24h > 10_000) {
    loops.push({
      loop_type: "latency_optimization",
      target_type: "orchestration",
      recommendation: "Switch low-priority workflows to cost-aware strategy and reserve concurrency for critical tasks.",
      expected_impact: { latencyMs: ops.metrics.automationLatencyAvgMs24h, throughputGain: 0.15 },
    });
  }

  if (ops.metrics.providerOffersOpen > 20) {
    loops.push({
      loop_type: "dispatch_balancing",
      target_type: "dispatch",
      recommendation: "Tighten provider offer batches and trigger fallback routing for stale offers.",
      expected_impact: { openOffers: ops.metrics.providerOffersOpen, acceptanceLift: 0.08 },
    });
  }

  if (!loops.length) return { created: 0, loops: [] };

  const { data, error } = await getAdminClient()
    .from("optimization_loops")
    .insert(loops.map((loop) => ({ tenant_id: tenantId, ...loop, correlation_id: correlationId })))
    .select("*");
  if (error) throw error;

  await getAdminClient().from("cognition_telemetry").insert({
    tenant_id: tenantId,
    signal_type: "adaptive_optimization",
    subject_type: "tenant",
    score: data?.length ?? 0,
    confidence: 0.8,
    metadata: { loops: data ?? [] },
    correlation_id: correlationId,
  }).then(() => null);

  return { created: data?.length ?? 0, loops: data ?? [], correlationId };
}

export async function getAdaptiveOpsSummary(tenantId: string) {
  const db = getAdminClient();
  const [{ data: loops }, { data: telemetry }] = await Promise.all([
    db.from("optimization_loops").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    db.from("cognition_telemetry").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
  ]);
  return { loops: loops ?? [], telemetry: telemetry ?? [] };
}
