import { createHmac } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

type WebhookSubscription = {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  signing_secret?: string | null;
  status: string;
};

type WebhookDelivery = {
  id: string;
  subscription_id: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  correlation_id?: string | null;
};

function signature(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function nextBackoff(attempt: number) {
  const seconds = Math.min(3600, Math.pow(2, attempt) * 30);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function enqueueWebhookDeliveries(input: {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("webhook_subscriptions")
    .select("id, tenant_id, url, events, signing_secret, status")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active");

  if (error) throw error;

  const subscriptions = ((data ?? []) as WebhookSubscription[]).filter(
    (subscription) => subscription.events.includes(input.eventType) || subscription.events.includes("*")
  );

  if (!subscriptions.length) return { enqueued: 0 };

  const rows = subscriptions.map((subscription) => ({
    tenant_id: input.tenantId,
    subscription_id: subscription.id,
    event_type: input.eventType,
    payload: input.payload,
    status: "pending",
    correlation_id: input.correlationId ?? createCorrelationId("wh"),
  }));

  const { error: insertError } = await db.from("webhook_deliveries").insert(rows);
  if (insertError) throw insertError;
  return { enqueued: rows.length };
}

export async function dispatchWebhookDeliveries(limit = 25) {
  const db = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("webhook_deliveries")
    .select("*, webhook_subscriptions(url, signing_secret)")
    .in("status", ["pending", "retrying"])
    .lte("next_retry_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const results = [];
  for (const row of (data ?? []) as Array<WebhookDelivery & { webhook_subscriptions?: { url?: string; signing_secret?: string | null } }>) {
    const target = row.webhook_subscriptions;
    if (!target?.url) {
      await db.from("webhook_deliveries").update({
        status: "dead_letter",
        error_message: "Missing webhook target URL",
        last_attempt_at: now,
      }).eq("id", row.id);
      results.push({ id: row.id, status: "dead_letter" });
      continue;
    }

    const body = JSON.stringify({
      id: row.id,
      type: row.event_type,
      tenant_id: row.tenant_id,
      correlation_id: row.correlation_id,
      data: row.payload,
      created_at: now,
    });

    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-velocity-event": row.event_type,
          "x-velocity-delivery": row.id,
          "x-velocity-signature": target.signing_secret ? signature(target.signing_secret, body) : "",
        },
        body,
      });

      if (response.ok) {
        await db.from("webhook_deliveries").update({
          status: "delivered",
          attempt_count: row.attempt_count + 1,
          last_attempt_at: now,
          delivered_at: now,
          response_status: response.status,
          error_message: null,
        }).eq("id", row.id);
        results.push({ id: row.id, status: "delivered", responseStatus: response.status });
      } else {
        const attempts = row.attempt_count + 1;
        const terminal = attempts >= row.max_attempts;
        await db.from("webhook_deliveries").update({
          status: terminal ? "dead_letter" : "retrying",
          attempt_count: attempts,
          last_attempt_at: now,
          response_status: response.status,
          error_message: `HTTP ${response.status}`,
          next_retry_at: terminal ? null : nextBackoff(attempts),
        }).eq("id", row.id);
        results.push({ id: row.id, status: terminal ? "dead_letter" : "retrying", responseStatus: response.status });
      }
    } catch (error) {
      const attempts = row.attempt_count + 1;
      const terminal = attempts >= row.max_attempts;
      await db.from("webhook_deliveries").update({
        status: terminal ? "dead_letter" : "retrying",
        attempt_count: attempts,
        last_attempt_at: now,
        error_message: error instanceof Error ? error.message : String(error),
        next_retry_at: terminal ? null : nextBackoff(attempts),
      }).eq("id", row.id);
      results.push({ id: row.id, status: terminal ? "dead_letter" : "retrying" });
    }
  }

  return { processed: results.length, results };
}
