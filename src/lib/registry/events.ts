export type EventStatus = "active" | "orphaned" | "deprecated";

export interface EventDefinition {
  type: string;
  producer: string;
  consumers: string[];
  retry: boolean;
  replay: boolean;
  dead_letter: boolean;
  status: EventStatus;
}

export const EVENT_REGISTRY: EventDefinition[] = [
  { type: "service_request_created", producer: "POST /api/jobs", consumers: ["handleAliceIntake"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "serviceability_passed", producer: "POST /api/jobs", consumers: ["handleAliceIntake", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "serviceability_failed", producer: "POST /api/jobs", consumers: ["handleAliceIntake"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_offer_sent", producer: "POST /api/admin/dispatch", consumers: ["handleProviderOffer", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_offer_expired", producer: "/api/cron/automation", consumers: ["handleProviderOffer", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "no_provider_accepted", producer: "/api/cron/automation", consumers: ["handleProviderOffer", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_arrived", producer: "POST /api/jobs/[id]/transition", consumers: ["handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "job_accepted", producer: "POST /api/jobs/[id]/transition", consumers: ["handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "job_reassigned", producer: "POST /api/admin/dispatch", consumers: ["handleProviderOffer", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "job_state_changed", producer: "POST /api/jobs/[id]/transition", consumers: ["handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "job_started", producer: "POST /api/jobs/[id]/transition", consumers: ["handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "job_completed", producer: "POST /api/jobs/[id]/transition + /api/webhooks/stripe", consumers: ["handleRexCompletion", "handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "customer_confirmed", producer: "POST /api/jobs/[id]/transition", consumers: ["handleRexCompletion", "handleNovaWorkflow"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "quote_submitted", producer: "POST /api/quotes", consumers: ["handleQuinnQuote"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "quote_validated", producer: "handleQuinnQuote", consumers: ["handleQuinnQuote"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "quote_flagged", producer: "handleQuinnQuote", consumers: ["handleQuinnQuote"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "quote_approved", producer: "POST /api/quotes/[id]", consumers: ["handleQuinnQuote", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "quote_rejected", producer: "POST /api/quotes/[id]", consumers: ["handleQuinnQuote"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "change_order_submitted", producer: "POST /api/jobs/[id]/transition", consumers: ["handleQuinnQuote"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payment_authorized", producer: "POST /api/payments/intent + /api/webhooks/stripe", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payment_captured", producer: "/api/webhooks/stripe", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payment_failed", producer: "/api/webhooks/stripe", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "failed_payment_retry", producer: "/api/cron/automation", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "refund_requested", producer: "POST /api/jobs/[id]/transition", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "refund_issued", producer: "/api/webhooks/stripe", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "chargeback_opened", producer: "/api/webhooks/stripe", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payout_queued", producer: "POST /api/jobs/[id]/transition", consumers: ["handlePayoutRelease", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payout_hold", producer: "handleIvyDispute", consumers: ["handlePayoutRelease", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payout_released", producer: "/api/cron/payouts", consumers: ["handlePayoutRelease", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payout_failed", producer: "/api/cron/payouts", consumers: ["handlePayoutRelease", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "payout_retry_scheduled", producer: "handleFinnPayment", consumers: ["handlePayoutRelease", "handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "dispute_opened", producer: "POST /api/disputes + POST /api/jobs/[id]/transition", consumers: ["handleIvyDispute"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "dispute_resolved", producer: "admin action", consumers: ["handleIvyDispute"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "review_requested", producer: "POST /api/jobs/[id]/transition", consumers: ["handleLenaRetention"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "sla_breach_detected", producer: "/api/cron/sla", consumers: ["handleSLACheck"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "sla_warning", producer: "/api/cron/sla", consumers: ["handleSLACheck"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "sla_breach", producer: "/api/cron/sla", consumers: ["handleSLACheck"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "stuck_job_detected", producer: "/api/cron/automation", consumers: ["handleSLACheck"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "tip_submitted", producer: "/api/webhooks/stripe", consumers: ["handleTipSubmitted"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "daily_territory_analysis", producer: "/api/cron/daily", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "high_demand_area_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_shortage_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "surge_pricing_recommended", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "territory_ready_for_expansion", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "franchise_candidate_area_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_scoring", producer: "/api/cron/daily-intelligence", consumers: ["handleRexCompletion"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "subscription_due", producer: "/api/cron/daily", consumers: ["handleLenaRetention"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "warranty_callback_due", producer: "/api/cron/daily-intelligence", consumers: ["handleLenaRetention"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "retention_campaign_due", producer: "/api/cron/daily", consumers: ["handleLenaRetention"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "cancellation_fee_applied", producer: "POST /api/jobs/[id]/transition", consumers: ["handleFinnPayment"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_penalty_applied", producer: "admin action", consumers: ["handleProviderOffer", "handleMaxDispatch"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "customer_churn_risk_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "recurring_service_opportunity_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
  { type: "provider_subscription_opportunity_detected", producer: "handleTessTerritory", consumers: ["handleTessTerritory"], retry: true, replay: true, dead_letter: true, status: "active" },
];

export function getOrphanedEvents(): EventDefinition[] {
  return EVENT_REGISTRY.filter(e => e.consumers.length === 0);
}

export function getEventsByStatus(status: EventStatus): EventDefinition[] {
  return EVENT_REGISTRY.filter(e => e.status === status);
}
