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
  | "agent_run"
  | "subscription_due"
  | "warranty_callback_due"
  | "membership_created"
  | "membership_renewed"
  | "membership_expiring"
  | "membership_cancelled"
  | "renewal_failed"
  | "operator_approved"
  | "territory_activated"
  | "franchise_royalty_due"
  | "membership_renewal_due"
  | "provider_at_risk_detected"
  | "customer_churn_risk_detected"
  | "high_demand_area_detected"
  | "provider_shortage_detected"
  | "surge_pricing_recommended"
  | "recurring_service_opportunity_detected"
  | "provider_subscription_opportunity_detected"
  | "territory_ready_for_expansion"
  | "franchise_candidate_area_detected"
  | "retention_campaign_due"
  | "provider_scoring_due"
  | "provider_penalty_applied"
  | "provider_offer_expired"
  | "job_reassigned"
  | "payment_authorized"
  | "failed_payment_retry"
  | "failed_notification_retry"
  | "refund_requested"
  | "refund_issued"
  | "chargeback_opened"
  | "payout_hold"
  | "payout_retry_scheduled"
  | "quote_validated"
  | "quote_flagged"
  | "change_order_submitted"
  | "job_started"
  | "provider_arrived"
  | "sla_breach_detected"
  | "stuck_job_detected"
  | "sla_warning";

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
