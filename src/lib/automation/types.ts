export const AUTOMATION_EVENT_TYPES = [
  "service_request_created",
  "serviceability_passed",
  "serviceability_failed",
  "provider_offer_sent",
  "provider_offer_expired",
  "no_provider_accepted",
  "job_accepted",
  "job_reassigned",
  "job_state_changed",
  "quote_submitted",
  "quote_validated",
  "quote_flagged",
  "quote_approved",
  "quote_rejected",
  "change_order_submitted",
  "payment_authorized",
  "payment_captured",
  "payment_failed",
  "failed_payment_retry",
  "failed_notification_retry",
  "job_started",
  "job_completed",
  "customer_confirmed",
  "review_requested",
  "dispute_opened",
  "dispute_resolved",
  "payout_queued",
  "payout_hold",
  "payout_released",
  "payout_failed",
  "payout_retry_scheduled",
  "refund_requested",
  "refund_issued",
  "chargeback_opened",
  "sla_breach_detected",
  "stuck_job_detected",
  "sla_warn",
  "sla_breach",
  "sla_escalate",
  "job_stuck",
  "provider_late",
  "subscription_due",
  "warranty_callback_due",
  "daily_territory_analysis",
  "provider_scoring",
  "provider_scoring_due",
  "retention_campaign",
  "retention_campaign_due",
  "high_demand_area_detected",
  "provider_shortage_detected",
  "surge_pricing_recommended",
  "recurring_service_opportunity_detected",
  "provider_subscription_opportunity_detected",
  "customer_churn_risk_detected",
  "territory_ready_for_expansion",
  "franchise_candidate_area_detected",
] as const;

export type AutomationEventType = (typeof AUTOMATION_EVENT_TYPES)[number];

export interface AutomationEventInput {
  type: AutomationEventType;
  source?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  tenantId?: string;
  payload?: Record<string, unknown>;
  dedupKey?: string;
}

export interface AutomationRouteResult {
  handled: boolean;
  actions: string[];
  output: Record<string, unknown>;
}

export interface AutomationQueueRow {
  id: string;
  event_id: string | null;
  event_type: AutomationEventType;
  payload: Record<string, unknown>;
  retry_count: number;
  tenant_id?: string | null;
}
