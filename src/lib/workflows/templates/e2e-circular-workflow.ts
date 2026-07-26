import { defineWorkflow, type WorkflowDefinition } from "../dsl";

// Full circular E2E workflow: Discovery → AI Intake → Provider Dispatch →
// Quote/Approval → Service Execution → Payment/Payout → Review/Retention →
// Platform Intelligence → feeds platform trust scores back to Discovery.
//
// Each phase segment is a standalone WorkflowDefinition whose final emit_event
// step fires the trigger.event of the next segment. The "loop-back" is modelled
// by segment 8 emitting `platform_cycle_complete`, which is the trigger of
// segment 1 — so a new booking request begins with an already-enriched context.

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Discovery & Booking
// Trigger: service_request_created (customer submits a job request)
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_DISCOVERY: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-1-discovery",
  name: "E2E Phase 1 — Discovery & Booking",
  version: "1.0.0",
  description: "Customer intake, geo-serviceability check, and job record creation.",
  trigger: { event: "service_request_created" },
  steps: [
    {
      id: "validate_request",
      name: "Validate Booking Request",
      type: "condition",
      config: { check: "request_fields_complete" },
      onSuccess: "geo_check",
      onFailure: "notify_incomplete",
    },
    {
      id: "geo_check",
      name: "Geo-Serviceability Check",
      type: "agent_call",
      config: { agent: "TESS", action: "checkServiceability" },
      onSuccess: "create_job_record",
      onFailure: "notify_outside_coverage",
    },
    {
      id: "notify_incomplete",
      name: "Notify Customer — Incomplete Request",
      type: "notify",
      config: { recipients: ["customer"], template: "request_incomplete" },
      onSuccess: "abort",
    },
    {
      id: "notify_outside_coverage",
      name: "Notify Customer — Outside Coverage",
      type: "notify",
      config: { recipients: ["customer"], template: "outside_coverage" },
      onSuccess: "abort",
    },
    {
      id: "create_job_record",
      name: "Create Job Record",
      type: "agent_call",
      config: { agent: "ALICE", action: "createJobRecord" },
      onSuccess: "emit_to_intake",
      onFailure: "escalate",
      retries: 2,
    },
    {
      id: "emit_to_intake",
      name: "Emit — Serviceability Passed",
      type: "emit_event",
      config: { event: "serviceability_passed" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: false,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — AI Intake (ALICE)
// Trigger: serviceability_passed
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_AI_INTAKE: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-2-ai-intake",
  name: "E2E Phase 2 — AI Intake",
  version: "1.0.0",
  description: "ALICE classifies the job, scores urgency, and prepares the match brief.",
  trigger: { event: "serviceability_passed" },
  steps: [
    {
      id: "classify_job",
      name: "ALICE — Classify Job Type",
      type: "agent_call",
      config: { agent: "ALICE", action: "classifyJob" },
      onSuccess: "score_urgency",
      onFailure: "escalate",
      retries: 1,
    },
    {
      id: "score_urgency",
      name: "ALICE — Score Urgency & Complexity",
      type: "agent_call",
      config: { agent: "ALICE", action: "scoreUrgency" },
      onSuccess: "prepare_match_brief",
      onFailure: "escalate",
    },
    {
      id: "prepare_match_brief",
      name: "ALICE — Prepare Provider Match Brief",
      type: "agent_call",
      config: { agent: "ALICE", action: "prepareMatchBrief" },
      onSuccess: "emit_to_dispatch",
      onFailure: "escalate",
      retries: 1,
    },
    {
      id: "emit_to_dispatch",
      name: "Emit — Awaiting Provider Match",
      type: "emit_event",
      config: { event: "awaiting_match" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "agent_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "pause_workflow", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: false,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Provider Dispatch (MAX)
// Trigger: awaiting_match
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_DISPATCH: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-3-dispatch",
  name: "E2E Phase 3 — Provider Dispatch",
  version: "1.0.0",
  description: "MAX ranks and invites providers; first acceptance moves to quoting.",
  trigger: { event: "awaiting_match" },
  steps: [
    {
      id: "rank_providers",
      name: "MAX — Rank Eligible Providers",
      type: "agent_call",
      config: { agent: "MAX", action: "rankProviders" },
      onSuccess: "send_offers",
      onFailure: "no_providers",
    },
    {
      id: "no_providers",
      name: "Notify Customer — No Providers Available",
      type: "notify",
      config: { recipients: ["customer", "admin"], template: "no_providers_available" },
      onSuccess: "abort",
    },
    {
      id: "send_offers",
      name: "MAX — Send Provider Offers",
      type: "agent_call",
      config: { agent: "MAX", action: "broadcastOffers", maxRecipients: 5 },
      onSuccess: "await_acceptance",
      onFailure: "escalate",
      timeoutMs: 3600000,
    },
    {
      id: "await_acceptance",
      name: "Wait — Provider Acceptance",
      type: "wait",
      config: { forEvent: "job_accepted", timeoutMs: 3600000 },
      onSuccess: "emit_to_quote",
      onFailure: "send_offers",
    },
    {
      id: "emit_to_quote",
      name: "Emit — Provider Offer Accepted",
      type: "emit_event",
      config: { event: "provider_offer_sent" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin", "ops"] },
    { condition: "step_failed", action: "retry", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: false,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Quote & Approval (QUINN + Human Gate)
// Trigger: provider_offer_sent
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_QUOTE_APPROVAL: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-4-quote-approval",
  name: "E2E Phase 4 — Quote & Approval",
  version: "1.0.0",
  description: "QUINN generates the quote; customer must explicitly approve before execution.",
  trigger: { event: "provider_offer_sent" },
  steps: [
    {
      id: "generate_quote",
      name: "QUINN — Generate Itemised Quote",
      type: "agent_call",
      config: { agent: "QUINN", action: "generateQuote" },
      onSuccess: "send_quote_to_customer",
      onFailure: "escalate",
      retries: 2,
    },
    {
      id: "send_quote_to_customer",
      name: "Notify Customer — Quote Ready",
      type: "notify",
      config: { recipients: ["customer"], template: "quote_ready" },
      onSuccess: "customer_approval",
    },
    {
      id: "customer_approval",
      name: "Human Gate — Customer Quote Approval",
      type: "human_approval",
      config: { approverRole: "customer", timeoutHours: 24, allowCounterOffer: true },
      onSuccess: "record_approval",
      onFailure: "handle_rejection",
      timeoutMs: 86400000,
    },
    {
      id: "handle_rejection",
      name: "QUINN — Handle Quote Rejection",
      type: "agent_call",
      config: { agent: "QUINN", action: "handleRejection" },
      onSuccess: "abort",
      onFailure: "escalate",
    },
    {
      id: "record_approval",
      name: "Record Quote Approval",
      type: "agent_call",
      config: { agent: "QUINN", action: "recordApproval" },
      onSuccess: "emit_to_execution",
      onFailure: "escalate",
    },
    {
      id: "emit_to_execution",
      name: "Emit — Quote Approved",
      type: "emit_event",
      config: { event: "quote_approved" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "approval_denied", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin", "provider"] },
    { condition: "agent_failed", action: "retry", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Service Execution (NOVA)
// Trigger: quote_approved
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_EXECUTION: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-5-execution",
  name: "E2E Phase 5 — Service Execution",
  version: "1.0.0",
  description: "NOVA tracks provider arrival, job start, and completion with real-time updates.",
  trigger: { event: "quote_approved" },
  steps: [
    {
      id: "schedule_job",
      name: "NOVA — Schedule Job",
      type: "agent_call",
      config: { agent: "NOVA", action: "scheduleJob" },
      onSuccess: "await_arrival",
      onFailure: "escalate",
    },
    {
      id: "await_arrival",
      name: "Wait — Provider Arrives On-Site",
      type: "wait",
      config: { forEvent: "provider_arrived", timeoutMs: 7200000 },
      onSuccess: "track_execution",
      onFailure: "handle_no_show",
    },
    {
      id: "handle_no_show",
      name: "NOVA — Handle Provider No-Show",
      type: "agent_call",
      config: { agent: "NOVA", action: "handleNoShow" },
      onSuccess: "escalate",
    },
    {
      id: "track_execution",
      name: "NOVA — Track Job Execution",
      type: "agent_call",
      config: { agent: "NOVA", action: "trackExecution" },
      onSuccess: "await_completion",
      onFailure: "escalate",
    },
    {
      id: "await_completion",
      name: "Wait — Job Marked Complete",
      type: "wait",
      config: { forEvent: "job_completed", timeoutMs: 28800000 },
      onSuccess: "customer_confirmation",
      onFailure: "escalate",
    },
    {
      id: "customer_confirmation",
      name: "Human Gate — Customer Job Confirmation",
      type: "human_approval",
      config: { approverRole: "customer", timeoutHours: 2, autoApproveOnTimeout: true },
      onSuccess: "emit_to_payment",
      onFailure: "handle_dispute_signal",
      timeoutMs: 7200000,
    },
    {
      id: "handle_dispute_signal",
      name: "NOVA — Flag Potential Dispute",
      type: "agent_call",
      config: { agent: "NOVA", action: "flagDispute" },
      onSuccess: "escalate",
    },
    {
      id: "emit_to_payment",
      name: "Emit — Customer Confirmed",
      type: "emit_event",
      config: { event: "customer_confirmed" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "timeout", action: "notify_admin", notifyRoles: ["admin", "provider", "customer"] },
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "agent_failed", action: "pause_workflow", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Payment & Payout (FINN + Human Gate)
// Trigger: customer_confirmed
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_PAYMENT: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-6-payment",
  name: "E2E Phase 6 — Payment & Payout",
  version: "1.0.0",
  description: "FINN captures payment, deducts platform fee, queues and releases provider payout.",
  trigger: { event: "customer_confirmed" },
  steps: [
    {
      id: "capture_payment",
      name: "FINN — Capture Customer Payment",
      type: "agent_call",
      config: { agent: "FINN", action: "capturePayment" },
      onSuccess: "deduct_fee",
      onFailure: "payment_retry",
      retries: 3,
      timeoutMs: 30000,
    },
    {
      id: "payment_retry",
      name: "FINN — Payment Retry / Manual",
      type: "human_approval",
      config: { approverRole: "finance", timeoutHours: 4 },
      onSuccess: "capture_payment",
      onFailure: "escalate",
      timeoutMs: 14400000,
    },
    {
      id: "deduct_fee",
      name: "FINN — Deduct Platform Fee",
      type: "agent_call",
      config: { agent: "FINN", action: "deductPlatformFee" },
      onSuccess: "queue_payout",
      onFailure: "escalate",
    },
    {
      id: "queue_payout",
      name: "FINN — Queue Provider Payout",
      type: "emit_event",
      config: { event: "payout_queued" },
      onSuccess: "await_payout_release",
    },
    {
      id: "await_payout_release",
      name: "Wait — Payout Released",
      type: "wait",
      config: { forEvent: "payout_released", timeoutMs: 86400000 },
      onSuccess: "notify_payout",
      onFailure: "escalate",
    },
    {
      id: "notify_payout",
      name: "Notify Provider — Payout Released",
      type: "notify",
      config: { recipients: ["provider", "customer"], template: "payout_released" },
      onSuccess: "emit_to_review",
    },
    {
      id: "emit_to_review",
      name: "Emit — Payment Cycle Complete",
      type: "emit_event",
      config: { event: "payment_captured" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "step_failed", action: "notify_admin", notifyRoles: ["finance", "admin"] },
    { condition: "timeout", action: "notify_admin", notifyRoles: ["finance"] },
    { condition: "approval_denied", action: "pause_workflow", notifyRoles: ["finance", "admin"] },
  ],
  humanInTheLoop: true,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — Review & Retention (REX + LENA)
// Trigger: payment_captured
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_REVIEW: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-7-review",
  name: "E2E Phase 7 — Review & Retention",
  version: "1.0.0",
  description: "REX solicits reviews; LENA scores NPS and triggers retention campaigns.",
  trigger: { event: "payment_captured" },
  steps: [
    {
      id: "request_review",
      name: "REX — Request Customer Review",
      type: "agent_call",
      config: { agent: "REX", action: "requestReview", delayMinutes: 30 },
      onSuccess: "await_review",
      onFailure: "skip_to_retention",
    },
    {
      id: "await_review",
      name: "Wait — Review Submitted",
      type: "wait",
      config: { forEvent: "review_submitted", timeoutMs: 172800000 },
      onSuccess: "score_nps",
      onFailure: "score_nps",
    },
    {
      id: "skip_to_retention",
      name: "Skip to Retention (Review Error)",
      type: "agent_call",
      config: { agent: "LENA", action: "runRetentionCheck" },
      onSuccess: "emit_to_intelligence",
      onFailure: "emit_to_intelligence",
    },
    {
      id: "score_nps",
      name: "REX — Score NPS & Update Provider Rating",
      type: "agent_call",
      config: { agent: "REX", action: "scoreNPS" },
      onSuccess: "retention_campaign",
      onFailure: "emit_to_intelligence",
    },
    {
      id: "retention_campaign",
      name: "LENA — Evaluate & Trigger Retention Campaign",
      type: "agent_call",
      config: { agent: "LENA", action: "evaluateRetention" },
      onSuccess: "emit_retention_event",
      onFailure: "emit_to_intelligence",
    },
    {
      id: "emit_retention_event",
      name: "Emit — Retention Campaign Triggered",
      type: "emit_event",
      config: { event: "retention_campaign" },
      onSuccess: "emit_to_intelligence",
    },
    {
      id: "emit_to_intelligence",
      name: "Emit — Review Cycle Complete",
      type: "emit_event",
      config: { event: "review_requested" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "agent_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "retry", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: false,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Platform Intelligence (TESS + GABRIEL)
// Trigger: review_requested  [acts on job completion data]
// Loop-back: emits `platform_cycle_complete` → enriches Phase 1 context
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_PHASE_INTELLIGENCE: WorkflowDefinition = defineWorkflow({
  id: "e2e-phase-8-intelligence",
  name: "E2E Phase 8 — Platform Intelligence",
  version: "1.0.0",
  description: "TESS runs territory analysis; GABRIEL scores governance health; cycle metrics feed back to Discovery.",
  trigger: { event: "review_requested" },
  steps: [
    {
      id: "territory_analysis",
      name: "TESS — Territory & Demand Analysis",
      type: "agent_call",
      config: { agent: "TESS", action: "runTerritoryAnalysis" },
      onSuccess: "provider_scoring",
      onFailure: "provider_scoring",
    },
    {
      id: "provider_scoring",
      name: "TESS — Update Provider Scores",
      type: "agent_call",
      config: { agent: "TESS", action: "updateProviderScores" },
      onSuccess: "governance_health",
      onFailure: "governance_health",
    },
    {
      id: "governance_health",
      name: "GABRIEL — Score Governance Health",
      type: "agent_call",
      config: { agent: "GABRIEL", action: "scoreGovernanceHealth" },
      onSuccess: "detect_drift",
      onFailure: "emit_cycle_complete",
    },
    {
      id: "detect_drift",
      name: "GABRIEL — Detect Policy Drift",
      type: "agent_call",
      config: { agent: "GABRIEL", action: "detectPolicyDrift" },
      onSuccess: "platform_summary",
      onFailure: "platform_summary",
    },
    {
      id: "platform_summary",
      name: "Generate Platform Intelligence Summary",
      type: "agent_call",
      config: { agent: "GABRIEL", action: "generatePlatformSummary" },
      onSuccess: "emit_cycle_complete",
      onFailure: "emit_cycle_complete",
    },
    {
      id: "emit_cycle_complete",
      name: "Emit — Platform Cycle Complete (loop back to Discovery)",
      type: "emit_event",
      config: { event: "platform_cycle_complete" },
      onSuccess: "end",
    },
  ],
  escalationRules: [
    { condition: "agent_failed", action: "notify_admin", notifyRoles: ["admin"] },
    { condition: "timeout", action: "retry", notifyRoles: ["admin"] },
  ],
  humanInTheLoop: false,
  observabilityHooks: ["log_step_execution", "trace_latency", "emit_cycle_metric"],
  tenantConfigurable: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Complete circular E2E workflow manifest — all 8 phases in order.
// ─────────────────────────────────────────────────────────────────────────────
export const E2E_CIRCULAR_WORKFLOW_PHASES = [
  E2E_PHASE_DISCOVERY,
  E2E_PHASE_AI_INTAKE,
  E2E_PHASE_DISPATCH,
  E2E_PHASE_QUOTE_APPROVAL,
  E2E_PHASE_EXECUTION,
  E2E_PHASE_PAYMENT,
  E2E_PHASE_REVIEW,
  E2E_PHASE_INTELLIGENCE,
] as const;

export type E2EPhaseId =
  | "e2e-phase-1-discovery"
  | "e2e-phase-2-ai-intake"
  | "e2e-phase-3-dispatch"
  | "e2e-phase-4-quote-approval"
  | "e2e-phase-5-execution"
  | "e2e-phase-6-payment"
  | "e2e-phase-7-review"
  | "e2e-phase-8-intelligence";
