export interface WebhookPayload {
  webhookId: string;
  source: string;
  eventType: string;
  signature?: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  tenantId?: string;
}

export interface NormalizationResult {
  success: boolean;
  webhookId: string;
  isDuplicate: boolean;
  internalEventType?: string;
  normalizedPayload?: Record<string, unknown>;
  error?: string;
}

const PROCESSED_WEBHOOK_IDS = new Set<string>();
const WEBHOOK_LOG: WebhookPayload[] = [];
let duplicatesBlocked = 0;

const EVENT_TYPE_MAP: Record<string, string> = {
  "payment_intent.succeeded": "payment_captured",
  "payment_intent.payment_failed": "payment_failed",
  "invoice.paid": "invoice_paid",
  "invoice.payment_failed": "invoice_payment_failed",
  "customer.subscription.created": "subscription_created",
  "customer.subscription.deleted": "subscription_cancelled",
  "message.delivered": "sms_delivered",
  "message.failed": "sms_failed",
};

function mapEventType(source: string, eventType: string): string | undefined {
  // Try source-prefixed key first
  const prefixed = `${source}.${eventType}`;
  if (EVENT_TYPE_MAP[prefixed]) return EVENT_TYPE_MAP[prefixed];
  return EVENT_TYPE_MAP[eventType];
}

function normalizePayload(raw: WebhookPayload): Record<string, unknown> {
  // Strip source-specific envelope, surface core data fields
  const { payload, source, eventType, tenantId, receivedAt } = raw;
  const data = (payload.data ?? payload.object ?? payload) as Record<string, unknown>;
  return {
    ...data,
    _source: source,
    _eventType: eventType,
    _tenantId: tenantId,
    _receivedAt: receivedAt,
  };
}

export function normalizeWebhook(raw: WebhookPayload): NormalizationResult {
  const { webhookId } = raw;

  if (PROCESSED_WEBHOOK_IDS.has(webhookId)) {
    duplicatesBlocked++;
    return { success: false, webhookId, isDuplicate: true };
  }

  if (PROCESSED_WEBHOOK_IDS.size > 10_000) {
    // Clear half the set
    const entries = Array.from(PROCESSED_WEBHOOK_IDS);
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    for (const id of toRemove) PROCESSED_WEBHOOK_IDS.delete(id);
  }

  PROCESSED_WEBHOOK_IDS.add(webhookId);

  if (WEBHOOK_LOG.length >= 200) {
    WEBHOOK_LOG.shift();
  }
  WEBHOOK_LOG.push(raw);

  const internalEventType = mapEventType(raw.source, raw.eventType);
  const normalizedPayload = normalizePayload(raw);

  return {
    success: true,
    webhookId,
    isDuplicate: false,
    internalEventType,
    normalizedPayload,
  };
}

export function getWebhookStats(): {
  total: number;
  duplicatesBlocked: number;
  bySource: Record<string, number>;
} {
  const bySource: Record<string, number> = {};
  for (const entry of WEBHOOK_LOG) {
    bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
  }
  return { total: WEBHOOK_LOG.length, duplicatesBlocked, bySource };
}

export function replayWebhook(webhookId: string): NormalizationResult | null {
  const entry = WEBHOOK_LOG.find((w) => w.webhookId === webhookId);
  if (!entry) return null;

  // Bypass dedup check for replay
  const internalEventType = mapEventType(entry.source, entry.eventType);
  const normalizedPayload = normalizePayload(entry);

  return {
    success: true,
    webhookId,
    isDuplicate: false,
    internalEventType,
    normalizedPayload,
  };
}
