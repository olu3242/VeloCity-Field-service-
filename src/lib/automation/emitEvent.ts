// VeloCity Automation Engine — Event Emitter
// Idempotent: dedup_key prevents duplicate events

import { getAdminClient } from "@/lib/supabase/admin";
import type { AutomationEventType, AutomationPayload } from "@/types/automation";

export interface EmitResult {
  eventId: string;
  queued: boolean;
  duplicate: boolean;
}

export async function emitEvent(
  eventType: AutomationEventType,
  payload: AutomationPayload,
  dedupKey?: string
): Promise<EmitResult> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  // ── 1. Deduplication check ───────────────────────────────
  if (dedupKey) {
    const { data: existing } = await db
      .from("automation_events")
      .select("id")
      .eq("dedup_key", dedupKey)
      .maybeSingle();

    if (existing) {
      return { eventId: existing.id, queued: false, duplicate: true };
    }
  }

  // ── 2. Persist event ─────────────────────────────────────
  const { data: event, error: eventError } = await db
    .from("automation_events")
    .insert({
      event_type: eventType,
      payload: payload as Record<string, unknown>,
      dedup_key: dedupKey ?? null,
      status: "received",
    })
    .select("id")
    .single();

  if (eventError || !event) {
    throw new Error(`Failed to emit event ${eventType}: ${eventError?.message}`);
  }

  // ── 3. Enqueue for processing ────────────────────────────
  const { error: queueError } = await db.from("automation_queue").insert({
    event_id: event.id,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
    status: "pending",
    retry_count: 0,
    max_retries: 3,
    next_retry_at: now,
    dedup_key: dedupKey ?? null,
  });

  if (queueError) {
    // Non-fatal — event is recorded, queue insertion failed
    console.error(`[emitEvent] Queue insert failed for ${eventType}:`, queueError.message);
    return { eventId: event.id, queued: false, duplicate: false };
  }

  // ── 4. Audit log ─────────────────────────────────────────
  await db.from("audit_logs").insert({
    actor_type: "system",
    action: "event_emitted",
    resource: "automation_events",
    resource_id: event.id,
    payload: { event_type: eventType, dedup_key: dedupKey ?? null },
  }).then(() => {/* non-blocking */});

  return { eventId: event.id, queued: true, duplicate: false };
}

// Convenience: emit multiple events atomically (best-effort)
export async function emitEvents(
  events: Array<{ type: AutomationEventType; payload: AutomationPayload; dedupKey?: string }>
): Promise<void> {
  await Promise.allSettled(
    events.map(({ type, payload, dedupKey }) => emitEvent(type, payload, dedupKey))
  );
}
