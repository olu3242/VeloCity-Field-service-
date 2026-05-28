import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import { createCorrelationId } from "@/runtime/telemetry/correlation";
import type { AutomationEventInput, AutomationEventType } from "./types";

type EmitResult = { eventId?: string; queued: boolean; error?: string; duplicate?: boolean };

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return Boolean(value && typeof value === "object" && "from" in value);
}

export async function emitEvent(
  supabase: SupabaseClient,
  input: AutomationEventInput
): Promise<EmitResult>;
export async function emitEvent(
  eventType: AutomationEventType | string,
  payload: unknown,
  dedupKey?: string
): Promise<EmitResult>;
export async function emitEvent(
  first: SupabaseClient | AutomationEventType | string,
  second: AutomationEventInput | unknown,
  third?: string
): Promise<EmitResult> {
  const supabase = isSupabaseClient(first) ? first : getAdminClient();
  const input: AutomationEventInput = isSupabaseClient(first)
    ? second as AutomationEventInput
    : {
        type: first as AutomationEventType,
        source: "app",
        payload: second as Record<string, unknown>,
        dedupKey: third,
      };

  const payload = input.payload ?? {};
  const tenantId = input.tenantId ?? (typeof payload.tenant_id === "string" ? payload.tenant_id : DEFAULT_TENANT_ID);
  const correlationId = typeof payload.correlation_id === "string" ? payload.correlation_id : createCorrelationId("evt");

  if (input.dedupKey) {
    const { data: existing } = await supabase
      .from("automation_events")
      .select("id")
      .eq("dedup_key", input.dedupKey)
      .maybeSingle();
    if (existing?.id) return { eventId: existing.id, queued: false, duplicate: true };
  }

  const { data: event, error: eventError } = await supabase
    .from("automation_events")
    .insert({
      tenant_id: tenantId,
      event_type: input.type,
      source: input.source ?? "app",
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      actor_id: input.actorId ?? null,
      payload,
      dedup_key: input.dedupKey ?? null,
      correlation_id: correlationId,
    })
    .select("id")
    .single();

  if (eventError) {
    return { queued: false, error: eventError.message };
  }

  const { error: queueError } = await supabase.from("automation_queue").insert({
    tenant_id: tenantId,
    event_id: event.id,
    event_type: input.type,
    payload: { ...payload, tenant_id: tenantId, correlation_id: correlationId },
    dedup_key: input.dedupKey ?? null,
    status: "pending",
    correlation_id: correlationId,
  });

  if (queueError) {
    return { eventId: event.id, queued: false, error: queueError.message };
  }

  import("@/runtime/webhooks/delivery")
    .then(({ enqueueWebhookDeliveries }) =>
      enqueueWebhookDeliveries({
        tenantId,
        eventType: input.type,
        payload: { ...payload, tenant_id: tenantId, correlation_id: correlationId, event_id: event.id },
        correlationId,
      })
    )
    .catch(() => null);

  import("@/runtime/intelligence/event-intelligence")
    .then(({ recordEventIntelligence }) =>
      recordEventIntelligence({
        tenantId,
        eventType: input.type,
        payload: payload as Record<string, unknown>,
        correlationId,
      })
    )
    .catch(() => null);

  return { eventId: event.id, queued: true, duplicate: false };
}

export async function emitEvents(
  events: Array<{ type: AutomationEventType; payload: Record<string, unknown>; dedupKey?: string }>
): Promise<void> {
  await Promise.allSettled(events.map(({ type, payload, dedupKey }) => emitEvent(type, payload, dedupKey)));
}
