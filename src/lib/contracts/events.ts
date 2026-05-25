/**
 * VeloCity Contracts — Event Types
 *
 * Canonical source of truth for all automation event types and the VeloEvent envelope.
 * Both src/types/automation.ts and src/lib/automation/types.ts should re-export from here.
 *
 * Event naming convention: <entity>_<past_tense_verb> for state changes,
 * <entity>_<action>_<trigger> for scheduled/detected signals.
 */

// ── Core job lifecycle ──────────────────────────────────────────────────────

/** Customer submitted a new service request — triggers ALICE intake review */
export type ServiceRequestCreatedEvent = "service_request_created";

/** ALICE confirmed the ZIP/category is serviceable — triggers MAX dispatch */
export type ServiceabilityPassedEvent = "serviceability_passed";

/** ALICE determined the request cannot be serviced — job cancelled */
export type ServiceabilityFailedEvent = "serviceability_failed";

/** MAX sent an offer to a provider — provider has limited time to accept */
export type ProviderOfferSentEvent = "provider_offer_sent";

/** A provider's offer window closed without acceptance */
export type ProviderOfferExpiredEvent = "provider_offer_expired";

/** All dispatched providers declined — triggers escalation */
export type NoProviderAcceptedEvent = "no_provider_accepted";

/** A provider accepted the job offer */
export type JobAcceptedEvent = "job_accepted";

/** Job was manually reassigned to a different provider by admin */
export type JobReassignedEvent = "job_reassigned";

/** Generic job status transition event */
export type JobStateChangedEvent = "job_state_changed";

// ── Quote & change order ────────────────────────────────────────────────────

/** Provider submitted a quote — triggers QUINN pricing review */
export type QuoteSubmittedEvent = "quote_submitted";

/** QUINN validated the quote as fair */
export type QuoteValidatedEvent = "quote_validated";

/** QUINN flagged the quote as potentially overpriced */
export type QuoteFlaggedEvent = "quote_flagged";

/** Customer approved the quote */
export type QuoteApprovedEvent = "quote_approved";

/** Customer rejected the quote */
export type QuoteRejectedEvent = "quote_rejected";

/** Provider submitted a change order during work */
export type ChangeOrderSubmittedEvent = "change_order_submitted";

// ── Job progress ────────────────────────────────────────────────────────────

/** Provider started travel to the job site */
export type JobStartedEvent = "job_started";

/** Provider marked the job as complete — awaiting customer confirmation */
export type JobCompletedEvent = "job_completed";

/** Customer confirmed the job completion — triggers payout release */
export type CustomerConfirmedEvent = "customer_confirmed";

/** Customer was asked to leave a review */
export type ReviewRequestedEvent = "review_requested";

// ── Disputes ────────────────────────────────────────────────────────────────

/** Customer or provider opened a dispute — triggers IVY analysis + payout freeze */
export type DisputeOpenedEvent = "dispute_opened";

/** Dispute was resolved — payout may be released or refund issued */
export type DisputeResolvedEvent = "dispute_resolved";

// ── Payments & payouts ──────────────────────────────────────────────────────

/** Stripe confirmed payment intent authorization */
export type PaymentAuthorizedEvent = "payment_authorized";

/** Payment was captured (escrowed) from customer */
export type PaymentCapturedEvent = "payment_captured";

/** Payment attempt failed — triggers FINN + notification */
export type PaymentFailedEvent = "payment_failed";

/** Cron detected a payment in failed state for retry */
export type FailedPaymentRetryEvent = "failed_payment_retry";

/** A notification was not sent within 15 minutes — retry needed */
export type FailedNotificationRetryEvent = "failed_notification_retry";

/** Payout was added to the payout_queue — awaiting release window */
export type PayoutQueuedEvent = "payout_queued";

/** Payout is on administrative hold */
export type PayoutHoldEvent = "payout_hold";

/** Payout release window passed — Stripe transfer should execute */
export type PayoutReleasedEvent = "payout_released";

/** Stripe transfer failed — triggers retry logic */
export type PayoutFailedEvent = "payout_failed";

/** A failed payout has been scheduled for retry */
export type PayoutRetryScheduledEvent = "payout_retry_scheduled";

/** Customer or admin requested a refund */
export type RefundRequestedEvent = "refund_requested";

/** Refund was issued via Stripe */
export type RefundIssuedEvent = "refund_issued";

/** Stripe chargeback (dispute) opened — triggers FINN + IVY */
export type ChargebackOpenedEvent = "chargeback_opened";

// ── SLA & operations ────────────────────────────────────────────────────────

/** An SLA threshold was detected as breached (from cron/automation) */
export type SLABreachDetectedEvent = "sla_breach_detected";

/** A job has not progressed in over 24 hours (from cron/automation) */
export type StuckJobDetectedEvent = "stuck_job_detected";

/** Job approaching SLA threshold — soft warning */
export type SLAWarnEvent = "sla_warn";

/** Job has exceeded SLA threshold — redispatch triggered */
export type SLABreachEvent = "sla_breach";

/** Multiple SLA breaches — escalated to human admin */
export type SLAEscalateEvent = "sla_escalate";

/** Job is stuck in an active status for more than 4 hours */
export type JobStuckEvent = "job_stuck";

/** Provider is running late to the job site */
export type ProviderLateEvent = "provider_late";

// ── Subscriptions & retention ───────────────────────────────────────────────

/** A recurring subscription service date is due */
export type SubscriptionDueEvent = "subscription_due";

/** A warranty callback service window is due */
export type WarrantyCallbackDueEvent = "warranty_callback_due";

/** Daily retention campaign trigger — batch processing */
export type RetentionCampaignEvent = "retention_campaign";

/** Per-customer retention check triggered by daily-intelligence cron */
export type RetentionCampaignDueEvent = "retention_campaign_due";

// ── Provider quality ────────────────────────────────────────────────────────

/** Daily batch trigger to re-score all provider trust scores */
export type ProviderScoringEvent = "provider_scoring";

/** Per-provider scoring check triggered by daily-intelligence cron */
export type ProviderScoringDueEvent = "provider_scoring_due";

// ── Tips ────────────────────────────────────────────────────────────────────

/** Customer submitted a tip after job completion */
export type TipSubmittedEvent = "tip_submitted";

// ── Territory & growth intelligence ────────────────────────────────────────

/** Daily batch: analyze all territories for supply/demand signals */
export type DailyTerritoryAnalysisEvent = "daily_territory_analysis";

/** TESS detected unusually high job request volume in an area */
export type HighDemandAreaDetectedEvent = "high_demand_area_detected";

/** TESS detected insufficient provider coverage in an area */
export type ProviderShortageDetectedEvent = "provider_shortage_detected";

/** TESS recommends activating surge pricing multiplier */
export type SurgePricingRecommendedEvent = "surge_pricing_recommended";

/** TESS identified a customer likely to book recurring services */
export type RecurringServiceOpportunityDetectedEvent = "recurring_service_opportunity_detected";

/** TESS identified a provider that could benefit from a subscription plan */
export type ProviderSubscriptionOpportunityDetectedEvent = "provider_subscription_opportunity_detected";

/** LENA/TESS detected a customer at risk of churning */
export type CustomerChurnRiskDetectedEvent = "customer_churn_risk_detected";

/** TESS determined a territory is ready for geographic expansion */
export type TerritoryReadyForExpansionEvent = "territory_ready_for_expansion";

/** TESS identified a territory as a franchise candidate */
export type FranchiseCandidateAreaDetectedEvent = "franchise_candidate_area_detected";

// ── Canonical union type ─────────────────────────────────────────────────────

/**
 * Complete set of all VeloCity automation event types.
 * This is the single source of truth — used by emitEvent, router, worker, and handlers.
 *
 * Note: src/types/automation.ts and src/lib/automation/types.ts both re-export this type
 * for backward compatibility.
 */
export type AutomationEventType =
  | "service_request_created"
  | "serviceability_passed"
  | "serviceability_failed"
  | "provider_offer_sent"
  | "provider_offer_expired"
  | "no_provider_accepted"
  | "job_accepted"
  | "job_reassigned"
  | "job_state_changed"
  | "quote_submitted"
  | "quote_validated"
  | "quote_flagged"
  | "quote_approved"
  | "quote_rejected"
  | "change_order_submitted"
  | "payment_authorized"
  | "payment_captured"
  | "payment_failed"
  | "failed_payment_retry"
  | "failed_notification_retry"
  | "job_started"
  | "job_completed"
  | "customer_confirmed"
  | "review_requested"
  | "dispute_opened"
  | "dispute_resolved"
  | "payout_queued"
  | "payout_hold"
  | "payout_released"
  | "payout_failed"
  | "payout_retry_scheduled"
  | "refund_requested"
  | "refund_issued"
  | "chargeback_opened"
  | "sla_breach_detected"
  | "stuck_job_detected"
  | "sla_warn"
  | "sla_breach"
  | "sla_escalate"
  | "job_stuck"
  | "provider_late"
  | "subscription_due"
  | "warranty_callback_due"
  | "daily_territory_analysis"
  | "provider_scoring"
  | "provider_scoring_due"
  | "retention_campaign"
  | "retention_campaign_due"
  | "high_demand_area_detected"
  | "provider_shortage_detected"
  | "surge_pricing_recommended"
  | "recurring_service_opportunity_detected"
  | "provider_subscription_opportunity_detected"
  | "customer_churn_risk_detected"
  | "territory_ready_for_expansion"
  | "franchise_candidate_area_detected"
  | "tip_submitted"
  | "agent_run";

/**
 * Runtime array of all event types — useful for validation and exhaustive checks.
 * Derived from the union type to avoid duplication.
 */
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
  "tip_submitted",
  "agent_run",
] as const satisfies readonly AutomationEventType[];

/** Type guard: check if a string is a valid AutomationEventType */
export function isAutomationEventType(value: string): value is AutomationEventType {
  return (AUTOMATION_EVENT_TYPES as readonly string[]).includes(value);
}

// ── VeloEvent envelope ────────────────────────────────────────────────────────

/**
 * The canonical event envelope used throughout the platform.
 * Wraps any event payload with standard metadata for routing, deduplication, and tracing.
 *
 * @template T - Payload type specific to the event. Defaults to Record<string, unknown>.
 */
export interface VeloEvent<T = Record<string, unknown>> {
  /** Unique event ID (UUID generated on insert) */
  id: string;

  /** The event type from the canonical AutomationEventType union */
  type: AutomationEventType;

  /** Event-specific payload — shape varies by type */
  payload: T;

  /**
   * Idempotency key — prevents duplicate processing of the same logical event.
   * Format convention: "<event_type>:<entity_id>[:<window>]"
   * Example: "payment_captured:job_abc123", "sla_warn:job_xyz:15"
   */
  idempotency_key: string;

  /** Tenant identifier for multi-tenant isolation */
  tenant_id?: string;

  /** ISO 8601 timestamp when the event was created */
  created_at: string;

  /** Current processing status */
  status: "received" | "processing" | "processed" | "failed" | "retrying";

  /** Number of processing attempts made */
  retry_count: number;

  /**
   * Optional trace ID for cross-hop debugging.
   * Propagated from HTTP request → emitEvent → queue → worker → agent.
   */
  trace_id?: string;
}

/**
 * Input shape for emitting a new event.
 * Subset of VeloEvent — id, created_at, status, retry_count are generated by the system.
 */
export interface VeloEventInput<T = Record<string, unknown>> {
  type: AutomationEventType;
  payload: T;
  idempotency_key?: string;
  tenant_id?: string;
  trace_id?: string;
  source?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
}
