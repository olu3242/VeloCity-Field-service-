import { getAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/automation/emitEvent";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export async function federateEvent(input: {
  tenantId: string;
  participantId?: string;
  eventType: string;
  direction: "inbound" | "outbound";
  payload: Record<string, unknown>;
  correlationId?: string;
}) {
  const db = getAdminClient();
  const correlationId = input.correlationId ?? createCorrelationId("fed");
  let governanceDecision = "allow";

  if (input.participantId) {
    const { data: participant } = await db
      .from("ecosystem_participants")
      .select("status, capabilities")
      .eq("id", input.participantId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (!participant || participant.status !== "active") governanceDecision = "reject";
    if (participant && Array.isArray(participant.capabilities) && !participant.capabilities.includes(input.eventType) && !participant.capabilities.includes("*")) {
      governanceDecision = "reject";
    }
  }

  const { data, error } = await db.from("federation_events").insert({
    tenant_id: input.tenantId,
    participant_id: input.participantId ?? null,
    event_type: input.eventType,
    direction: input.direction,
    status: governanceDecision === "allow" ? "pending" : "rejected",
    payload: input.payload,
    governance_decision: governanceDecision,
    correlation_id: correlationId,
  }).select("*").single();
  if (error) throw error;

  if (governanceDecision === "allow" && input.direction === "inbound") {
    await emitEvent(input.eventType, {
      ...input.payload,
      tenant_id: input.tenantId,
      federation_event_id: data.id,
      correlation_id: correlationId,
    }, `federation:${data.id}`);
  }

  await db.from("cognition_telemetry").insert({
    tenant_id: input.tenantId,
    signal_type: "federation",
    subject_type: "federation_event",
    subject_id: data.id,
    score: governanceDecision === "allow" ? 1 : 0,
    confidence: 0.9,
    metadata: { event_type: input.eventType, direction: input.direction, governance_decision: governanceDecision },
    correlation_id: correlationId,
  }).then(() => null);

  return data;
}
