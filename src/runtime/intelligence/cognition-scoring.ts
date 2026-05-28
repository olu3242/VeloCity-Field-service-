import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

function level(score: number) {
  if (score >= 85) return "low";
  if (score >= 65) return "medium";
  if (score >= 40) return "high";
  return "critical";
}

export async function scoreOrchestrationCognition(input: {
  tenantId: string;
  subjectType: string;
  subjectId?: string;
  scoreType: string;
  latencyMs?: number;
  failureCount?: number;
  confidence?: number;
  correlationId?: string;
}) {
  const latencyPenalty = Math.min(35, Math.floor((input.latencyMs ?? 0) / 1000));
  const failurePenalty = (input.failureCount ?? 0) * 20;
  const confidenceBoost = Math.round((input.confidence ?? 0.75) * 20);
  const score = Math.max(0, Math.min(100, 80 + confidenceBoost - latencyPenalty - failurePenalty));
  const reasons = [
    `latency_penalty=${latencyPenalty}`,
    `failure_penalty=${failurePenalty}`,
    `confidence_boost=${confidenceBoost}`,
  ];
  const recommendations = score < 65
    ? ["Reduce orchestration fan-out or switch to resilient execution strategy."]
    : ["Maintain current orchestration strategy."];

  const { data, error } = await getAdminClient()
    .from("cognition_scores")
    .insert({
      tenant_id: input.tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId ?? null,
      score_type: input.scoreType,
      score,
      level: level(score),
      reasons,
      recommendations,
      correlation_id: input.correlationId ?? createCorrelationId("cog"),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getCognitionScores(tenantId: string) {
  const { data, error } = await getAdminClient()
    .from("cognition_scores")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
