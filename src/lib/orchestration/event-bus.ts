export type EventBusChannel =
  | "internal"
  | "stripe"
  | "partner"
  | "analytics"
  | "crm"
  | "erp";

export interface ExternalEvent {
  externalId: string;
  channel: EventBusChannel;
  eventType: string;
  source: string;
  payload: Record<string, unknown>;
  tenantId?: string;
  receivedAt: string;
  processed: boolean;
  retryCount: number;
}

export interface EventBusResult {
  success: boolean;
  internalEventType?: string;
  externalId: string;
  error?: string;
}

const EVENT_BUS_LOG: ExternalEvent[] = [];
const CHANNEL_MAPPINGS = new Map<string, string>();

export function registerChannelMapping(
  externalType: string,
  internalType: string
): void {
  CHANNEL_MAPPINGS.set(externalType, internalType);
}

// Pre-register standard mappings
registerChannelMapping("stripe.payment_intent.succeeded", "payment_captured");
registerChannelMapping("stripe.payment_intent.payment_failed", "payment_failed");
registerChannelMapping("stripe.charge.dispute.created", "dispute_opened");
registerChannelMapping("partner.job.completed", "job_completed");
registerChannelMapping("partner.provider.suspended", "agent_run");

export async function ingestExternalEvent(
  event: Omit<ExternalEvent, "receivedAt" | "processed" | "retryCount">
): Promise<EventBusResult> {
  const entry: ExternalEvent = {
    ...event,
    receivedAt: new Date().toISOString(),
    processed: false,
    retryCount: 0,
  };
  EVENT_BUS_LOG.push(entry);

  const mappingKey = `${event.channel}.${event.eventType}`;
  const internalEventType = CHANNEL_MAPPINGS.get(mappingKey);

  if (!internalEventType) {
    return {
      success: false,
      externalId: event.externalId,
      error: "No mapping",
    };
  }

  const { emitEvent } = await import("@/lib/automation/emitEvent");
  await emitEvent(internalEventType, event.payload, event.tenantId);

  entry.processed = true;
  return {
    success: true,
    internalEventType,
    externalId: event.externalId,
  };
}

export function getEventBusStats(): {
  total: number;
  processed: number;
  failed: number;
  byChannel: Record<string, number>;
} {
  const byChannel: Record<string, number> = {};
  for (const e of EVENT_BUS_LOG) {
    byChannel[e.channel] = (byChannel[e.channel] ?? 0) + 1;
  }
  return {
    total: EVENT_BUS_LOG.length,
    processed: EVENT_BUS_LOG.filter((e) => e.processed).length,
    failed: EVENT_BUS_LOG.filter((e) => !e.processed).length,
    byChannel,
  };
}

export function getRecentEvents(limit = 20): ExternalEvent[] {
  return EVENT_BUS_LOG.slice(-limit);
}
