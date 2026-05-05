// VeloCity Automation Engine — Type Definitions

export type AutomationEventType =
  | "service_request_created"
  | "serviceability_passed"
  | "serviceability_failed"
  | "provider_offer_sent"
  | "job_accepted"
  | "job_state_changed"
  | "quote_submitted"
  | "quote_approved"
  | "quote_rejected"
  | "payment_captured"
  | "job_completed"
  | "customer_confirmed"
  | "dispute_opened"
  | "dispute_resolved"
  | "payout_queued"
  | "payout_released"
  | "payout_failed"
  | "payment_failed"
  | "provider_late"
  | "no_provider_accepted"
  | "job_stuck"
  | "sla_warn"
  | "sla_breach"
  | "sla_escalate"
  | "daily_territory_analysis"
  | "retention_campaign"
  | "provider_scoring"
  | "tip_submitted"
  | "agent_run";

export type QueueStatus = "pending" | "processing" | "completed" | "failed" | "skipped";
export type RunStatus   = "running"  | "completed" | "failed"  | "skipped";

// ── Payload shapes per event ────────────────────────────────

export interface ServiceRequestCreatedPayload {
  job_id: string;
  customer_id: string;
  category: string;
  urgency: string;
  zip: string;
  title: string;
  description: string;
}

export interface ServiceabilityPassedPayload {
  job_id: string;
  category: string;
  urgency: string;
  zip: string;
  city: string;
  state: string;
  ai_classification?: Record<string, unknown>;
}

export interface JobAcceptedPayload {
  job_id: string;
  provider_id: string;
  customer_id: string;
  urgency: string;
}

export interface JobStateChangedPayload {
  job_id: string;
  from_status: string;
  to_status: string;
  actor_role: string;
  reason?: string;
}

export interface QuoteSubmittedPayload {
  job_id: string;
  quote_id: string;
  provider_id: string;
  customer_id: string;
  total_cents: number;
  line_items: unknown[];
}

export interface QuoteApprovedPayload {
  job_id: string;
  quote_id: string;
  customer_id: string;
  provider_id: string;
  total_cents: number;
}

export interface JobCompletedPayload {
  job_id: string;
  provider_id: string;
  customer_id: string;
  total_cents: number;
}

export interface DisputeOpenedPayload {
  job_id: string;
  dispute_id: string;
  customer_id: string;
  provider_id: string;
  reason: string;
}

export interface PayoutQueuedPayload {
  job_id: string;
  provider_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  net_payout_cents: number;
  release_after: string;
}

export interface SLAPayload {
  job_id: string;
  status: string;
  minutes_elapsed: number;
  threshold_minutes: number;
}

export interface TipSubmittedPayload {
  tip_id: string;
  job_id: string;
  provider_id: string;
  customer_id: string;
  amount_cents: number;
  note?: string | null;
}

export type AutomationPayload =
  | TipSubmittedPayload
  | ServiceRequestCreatedPayload
  | ServiceabilityPassedPayload
  | JobAcceptedPayload
  | JobStateChangedPayload
  | QuoteSubmittedPayload
  | QuoteApprovedPayload
  | JobCompletedPayload
  | DisputeOpenedPayload
  | PayoutQueuedPayload
  | SLAPayload
  | Record<string, unknown>;

// ── Database row shapes ──────────────────────────────────────

export interface AutomationEvent {
  id: string;
  event_type: AutomationEventType;
  payload: AutomationPayload;
  dedup_key: string | null;
  status: "received" | "processing" | "completed" | "failed";
  retry_count: number;
  created_at: string;
  processed_at: string | null;
}

export interface AutomationQueueItem {
  id: string;
  event_id: string | null;
  event_type: AutomationEventType;
  payload: AutomationPayload;
  status: QueueStatus;
  retry_count: number;
  max_retries: number;
  next_retry_at: string;
  dedup_key: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AutomationRun {
  id: string;
  queue_id: string | null;
  event_type: AutomationEventType;
  handler: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: RunStatus;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ── Handler contract ─────────────────────────────────────────

export interface HandlerResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  emitEvents?: Array<{ type: AutomationEventType; payload: AutomationPayload; dedupKey?: string }>;
}

export type EventHandler = (
  payload: AutomationPayload,
  queueItem: AutomationQueueItem
) => Promise<HandlerResult>;
