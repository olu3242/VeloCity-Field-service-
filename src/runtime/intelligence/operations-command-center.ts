import "@/runtime/server-only";
import { getSystemHealth } from "@/runtime/health/system-health";
import { buildOperationalPulse } from "@/lib/scoring/composite/operationalScoring";
import { getAdminClient } from "@/lib/supabase/admin";

type CountResult = { count: number | null };

function countValue(result: CountResult) {
  return result.count ?? 0;
}

function severityFromHealth(status: string) {
  if (status === "down") return "critical";
  if (status === "degraded") return "warning";
  return "info";
}

export async function getOperationsCommandCenter(tenantId?: string) {
  const health = await getSystemHealth();

  if (health.status === "down") {
    return {
      health,
      pulse: buildOperationalPulse({
        pendingQueueItems: health.queue.pending,
        processingQueueItems: health.queue.processing,
        openDisputes: 0,
        pendingPayoutsCents: 0,
        failedQueueItems: health.queue.failed,
      }),
      metrics: {
        gmvCents30d: 0,
        jobs30d: 0,
        openDisputes: 0,
        providersActive: 0,
        providerOffersOpen: 0,
        aiRuns24h: 0,
        aiCostUsd24h: 0,
        automationLatencyAvgMs24h: 0,
        usageCostUsd30d: 0,
      },
      alerts: health.warnings.map((warning) => ({
        severity: severityFromHealth(health.status),
        system: "runtime",
        title: warning,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  const db = getAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const [
    jobs30d,
    openDisputes,
    activeProviders,
    openOffers,
    aiRuns24h,
    openAlerts,
    recentPayments,
    recentUsage,
    automationRuns,
  ] = await Promise.all([
    tenantId ? db.from("jobs").select("*", { count: "exact", head: true }).gte("created_at", since30d).eq("tenant_id", tenantId) : db.from("jobs").select("*", { count: "exact", head: true }).gte("created_at", since30d),
    tenantId ? db.from("disputes").select("*", { count: "exact", head: true }).neq("status", "resolved").eq("tenant_id", tenantId) : db.from("disputes").select("*", { count: "exact", head: true }).neq("status", "resolved"),
    tenantId ? db.from("providers").select("*", { count: "exact", head: true }).eq("status", "approved").eq("tenant_id", tenantId) : db.from("providers").select("*", { count: "exact", head: true }).eq("status", "approved"),
    tenantId ? db.from("provider_offers").select("*", { count: "exact", head: true }).is("responded_at", null).eq("tenant_id", tenantId) : db.from("provider_offers").select("*", { count: "exact", head: true }).is("responded_at", null),
    tenantId ? db.from("ai_execution_audits").select("*", { count: "exact", head: true }).gte("created_at", since24h).eq("tenant_id", tenantId) : db.from("ai_execution_audits").select("*", { count: "exact", head: true }).gte("created_at", since24h),
    tenantId ? db.from("operational_alerts").select("severity, system, title, detail, created_at").eq("status", "open").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10) : db.from("operational_alerts").select("severity, system, title, detail, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(10),
    tenantId ? db.from("payments").select("amount, amount_cents, status, created_at").gte("created_at", since30d).eq("tenant_id", tenantId) : db.from("payments").select("amount, amount_cents, status, created_at").gte("created_at", since30d),
    tenantId ? db.from("usage_meter_events").select("total_cost_usd, created_at").gte("created_at", since30d).eq("tenant_id", tenantId) : db.from("usage_meter_events").select("total_cost_usd, created_at").gte("created_at", since30d),
    tenantId ? db.from("automation_runs").select("duration_ms, started_at").gte("started_at", since24h).not("duration_ms", "is", null).eq("tenant_id", tenantId) : db.from("automation_runs").select("duration_ms, started_at").gte("started_at", since24h).not("duration_ms", "is", null),
  ]);

  const payments = (recentPayments.data ?? []) as Array<{ amount?: number | null; amount_cents?: number | null; status?: string | null }>;
  const gmvCents30d = payments.reduce((sum, payment) => {
    if (payment.status && ["failed", "refunded", "canceled"].includes(payment.status)) return sum;
    return sum + (payment.amount_cents ?? Math.round((payment.amount ?? 0) * 100));
  }, 0);

  const usageCostUsd30d = ((recentUsage.data ?? []) as Array<{ total_cost_usd?: number | string | null }>).reduce(
    (sum, row) => sum + Number(row.total_cost_usd ?? 0),
    0
  );

  const durations = ((automationRuns.data ?? []) as Array<{ duration_ms?: number | null }>).map((row) => row.duration_ms ?? 0);
  const automationLatencyAvgMs24h = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  const aiCostQuery = tenantId
    ? db.from("ai_execution_audits").select("estimated_cost_usd").gte("created_at", since24h).eq("tenant_id", tenantId)
    : db.from("ai_execution_audits").select("estimated_cost_usd").gte("created_at", since24h);
  const aiCostUsd24h = await aiCostQuery.then(({ data }) =>
    ((data ?? []) as Array<{ estimated_cost_usd?: number | string | null }>).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0
    )
  );

  const pulse = buildOperationalPulse({
    pendingQueueItems: health.queue.pending,
    processingQueueItems: health.queue.processing,
    openDisputes: countValue(openDisputes),
    pendingPayoutsCents: health.payouts.queued * 100,
    failedQueueItems: health.queue.failed,
  });

  return {
    health,
    pulse,
    metrics: {
      gmvCents30d,
      jobs30d: countValue(jobs30d),
      openDisputes: countValue(openDisputes),
      providersActive: countValue(activeProviders),
      providerOffersOpen: countValue(openOffers),
      aiRuns24h: countValue(aiRuns24h),
      aiCostUsd24h,
      automationLatencyAvgMs24h,
      usageCostUsd30d,
    },
    alerts: [
      ...(openAlerts.data ?? []),
      ...health.warnings.map((warning) => ({ severity: severityFromHealth(health.status), system: "runtime", title: warning })),
    ],
    generatedAt: new Date().toISOString(),
  };
}
