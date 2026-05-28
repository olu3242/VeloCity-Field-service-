import { evaluateConfidence } from "@/lib/ai-quality/confidence-threshold";
import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export type AiGovernanceInput = {
  tenantId?: string | null;
  actorId?: string | null;
  agent: string;
  domain: string;
  action: string;
  confidence: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  fallbackUsed?: boolean;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

const AI_TOKEN_COST_USD = 0.00001;

export async function recordAiGovernanceDecision(input: AiGovernanceInput) {
  const db = getAdminClient();
  const correlationId = input.correlationId ?? createCorrelationId("ai");
  const promptTokens = input.promptTokens ?? 0;
  const completionTokens = input.completionTokens ?? 0;
  const estimatedCostUsd = (promptTokens + completionTokens) * AI_TOKEN_COST_USD;
  const decision = evaluateConfidence(input.agent, input.domain, input.confidence);
  const approved = decision === "auto_approve" || decision === "approve";

  const payload = {
    tenant_id: input.tenantId ?? undefined,
    actor_id: input.actorId ?? undefined,
    agent: input.agent,
    domain: input.domain,
    action: input.action,
    confidence: input.confidence,
    decision,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost_usd: estimatedCostUsd,
    latency_ms: input.latencyMs ?? 0,
    fallback_used: Boolean(input.fallbackUsed),
    approved,
    correlation_id: correlationId,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await db.from("ai_execution_audits").insert(payload).select("*").single();
  if (error) throw error;

  await db.from("usage_meter_events").insert({
    tenant_id: input.tenantId ?? undefined,
    metric: "ai_tokens",
    quantity: promptTokens + completionTokens,
    unit_cost_usd: AI_TOKEN_COST_USD,
    source: "ai_runtime",
    correlation_id: correlationId,
    metadata: { agent: input.agent, domain: input.domain, action: input.action },
  }).then(() => null);

  if (!approved) {
    await db.from("operational_alerts").insert({
      tenant_id: input.tenantId ?? undefined,
      severity: decision === "reject" ? "critical" : "warning",
      system: "ai_governance",
      title: `${input.agent} ${decision.replace("_", " ")}`,
      detail: `${input.action} confidence ${input.confidence.toFixed(2)} in ${input.domain}`,
      correlation_id: correlationId,
      metadata: payload,
    }).then(() => null);
  }

  return data;
}

export async function getAiGovernanceSummary(tenantId?: string) {
  const db = getAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  let query = db.from("ai_execution_audits").select("*").gte("created_at", since24h).order("created_at", { ascending: false }).limit(100);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    decision: string;
    estimated_cost_usd?: number | string | null;
    latency_ms?: number | null;
    fallback_used?: boolean | null;
  }>;

  const costUsd24h = rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  const avgLatencyMs = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + (row.latency_ms ?? 0), 0) / rows.length)
    : 0;

  return {
    total24h: rows.length,
    approved24h: rows.filter((row) => row.decision === "approve" || row.decision === "auto_approve").length,
    rejected24h: rows.filter((row) => row.decision === "reject").length,
    fallback24h: rows.filter((row) => row.fallback_used).length,
    costUsd24h,
    avgLatencyMs,
    recent: rows.slice(0, 20),
  };
}
