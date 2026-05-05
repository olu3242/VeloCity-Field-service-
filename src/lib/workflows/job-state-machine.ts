// VeloCity — 30-State Job Workflow State Machine
import type { JobStatus, UserRole } from "@/types";

export interface StateTransition {
  from: JobStatus;
  to: JobStatus;
  allowedRoles: UserRole[];
  label: string;
  requiresReason?: boolean;
}

export const JOB_TRANSITIONS: StateTransition[] = [
  // Customer submits draft
  { from: "draft", to: "submitted", allowedRoles: ["customer"], label: "Submit Request" },

  // System checks serviceability
  { from: "submitted", to: "awaiting_serviceability", allowedRoles: ["admin"], label: "Check Serviceability" },
  { from: "submitted", to: "awaiting_match", allowedRoles: ["admin"], label: "Skip Serviceability (serviceable)" },

  // Serviceability resolved
  { from: "awaiting_serviceability", to: "awaiting_match", allowedRoles: ["admin"], label: "Area Confirmed Serviceable" },
  { from: "awaiting_serviceability", to: "cancelled", allowedRoles: ["admin"], label: "Area Not Serviceable", requiresReason: true },

  // Dispatch flow
  { from: "awaiting_match", to: "offer_sent", allowedRoles: ["admin"], label: "Send Offers to Providers" },
  { from: "awaiting_match", to: "cancelled", allowedRoles: ["admin"], label: "No Providers Available", requiresReason: true },

  // Provider responds to offer
  { from: "offer_sent", to: "accepted", allowedRoles: ["provider"], label: "Accept Job" },
  { from: "offer_sent", to: "awaiting_match", allowedRoles: ["provider", "admin"], label: "Reject Offer" },
  { from: "offer_sent", to: "expired", allowedRoles: ["admin"], label: "Offer Expired" },

  // Scheduling
  { from: "accepted", to: "scheduled", allowedRoles: ["provider", "admin"], label: "Schedule Job" },
  { from: "accepted", to: "deposit_required", allowedRoles: ["admin"], label: "Request Deposit" },

  // Deposit flow
  { from: "scheduled", to: "deposit_required", allowedRoles: ["admin"], label: "Request Deposit" },
  { from: "deposit_required", to: "deposit_paid", allowedRoles: ["customer", "admin"], label: "Pay Deposit" },
  { from: "deposit_paid", to: "scheduled", allowedRoles: ["admin"], label: "Confirm Scheduled" },

  // Provider en route
  { from: "scheduled", to: "en_route", allowedRoles: ["provider"], label: "Start Driving" },
  { from: "deposit_paid", to: "en_route", allowedRoles: ["provider"], label: "Start Driving" },

  // Provider arrives
  { from: "en_route", to: "arrived", allowedRoles: ["provider"], label: "Mark Arrived" },
  { from: "en_route", to: "no_show", allowedRoles: ["customer", "admin"], label: "Provider No Show", requiresReason: true },

  // Diagnosis
  { from: "arrived", to: "diagnosis_in_progress", allowedRoles: ["provider"], label: "Begin Diagnosis" },

  // Quote
  { from: "diagnosis_in_progress", to: "quote_submitted", allowedRoles: ["provider"], label: "Submit Quote" },
  { from: "quote_submitted", to: "awaiting_quote_approval", allowedRoles: ["admin"], label: "Send Quote to Customer" },

  // Customer approves/rejects quote
  { from: "awaiting_quote_approval", to: "quote_approved", allowedRoles: ["customer"], label: "Approve Quote" },
  { from: "awaiting_quote_approval", to: "cancelled", allowedRoles: ["customer"], label: "Reject Quote", requiresReason: true },

  // Work begins
  { from: "quote_approved", to: "in_progress", allowedRoles: ["provider"], label: "Start Work" },

  // Change order
  { from: "in_progress", to: "change_order_submitted", allowedRoles: ["provider"], label: "Submit Change Order" },
  { from: "change_order_submitted", to: "awaiting_change_order_approval", allowedRoles: ["admin"], label: "Forward Change Order" },
  { from: "awaiting_change_order_approval", to: "change_order_approved", allowedRoles: ["customer"], label: "Approve Change Order" },
  { from: "awaiting_change_order_approval", to: "in_progress", allowedRoles: ["customer"], label: "Reject Change Order" },
  { from: "change_order_approved", to: "in_progress", allowedRoles: ["provider"], label: "Continue Work" },

  // Completion
  { from: "in_progress", to: "completed_pending_confirmation", allowedRoles: ["provider"], label: "Mark Complete" },
  { from: "completed_pending_confirmation", to: "customer_confirmed", allowedRoles: ["customer"], label: "Confirm Completion" },
  { from: "completed_pending_confirmation", to: "disputed", allowedRoles: ["customer"], label: "Dispute Completion", requiresReason: true },
  { from: "customer_confirmed", to: "completed", allowedRoles: ["admin"], label: "Finalize Job" },
  { from: "completed_pending_confirmation", to: "completed", allowedRoles: ["admin"], label: "Auto-Complete (48h timeout)" },

  // Disputes
  { from: "completed", to: "disputed", allowedRoles: ["customer"], label: "Open Dispute", requiresReason: true },
  { from: "disputed", to: "refund_pending", allowedRoles: ["admin"], label: "Approve Refund" },
  { from: "disputed", to: "completed", allowedRoles: ["admin"], label: "Resolve for Provider" },
  { from: "refund_pending", to: "refunded", allowedRoles: ["admin"], label: "Process Refund" },
  { from: "refunded", to: "closed", allowedRoles: ["admin"], label: "Close Job" },

  // Warranty
  { from: "completed", to: "warranty_callback_open", allowedRoles: ["customer"], label: "Request Warranty Callback" },
  { from: "warranty_callback_open", to: "in_progress", allowedRoles: ["provider"], label: "Return for Warranty Work" },
  { from: "warranty_callback_open", to: "closed", allowedRoles: ["admin"], label: "Close Warranty" },

  // Close
  { from: "completed", to: "closed", allowedRoles: ["admin"], label: "Close Job" },
  { from: "customer_confirmed", to: "closed", allowedRoles: ["admin"], label: "Close Job" },

  // Cancellations
  { from: "draft", to: "cancelled", allowedRoles: ["customer", "admin"], label: "Cancel", requiresReason: true },
  { from: "submitted", to: "cancelled", allowedRoles: ["customer", "admin"], label: "Cancel", requiresReason: true },
  { from: "accepted", to: "cancelled", allowedRoles: ["customer", "provider", "admin"], label: "Cancel", requiresReason: true },
  { from: "scheduled", to: "cancelled", allowedRoles: ["customer", "provider", "admin"], label: "Cancel", requiresReason: true },
  { from: "no_show", to: "cancelled", allowedRoles: ["admin"], label: "Close No-Show" },
  { from: "no_show", to: "awaiting_match", allowedRoles: ["admin"], label: "Re-dispatch After No-Show" },
];

export function getAvailableTransitions(
  currentStatus: JobStatus,
  actorRole: UserRole
): StateTransition[] {
  return JOB_TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.allowedRoles.includes(actorRole)
  );
}

export function canTransition(
  from: JobStatus,
  to: JobStatus,
  actorRole: UserRole
): { allowed: boolean; requiresReason: boolean } {
  const transition = JOB_TRANSITIONS.find(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(actorRole)
  );
  return {
    allowed: !!transition,
    requiresReason: transition?.requiresReason ?? false,
  };
}

// Terminal states — no further transitions possible except admin override
export const TERMINAL_STATES: JobStatus[] = ["closed", "cancelled", "expired", "refunded"];

// Active states — provider is actively working
export const ACTIVE_STATES: JobStatus[] = [
  "en_route",
  "arrived",
  "diagnosis_in_progress",
  "in_progress",
  "change_order_submitted",
  "change_order_approved",
];

// Awaiting customer action
export const CUSTOMER_ACTION_STATES: JobStatus[] = [
  "deposit_required",
  "awaiting_quote_approval",
  "awaiting_change_order_approval",
  "completed_pending_confirmation",
];

// Awaiting provider action
export const PROVIDER_ACTION_STATES: JobStatus[] = [
  "offer_sent",
  "accepted",
  "scheduled",
  "deposit_paid",
  "arrived",
  "diagnosis_in_progress",
  "quote_approved",
  "change_order_approved",
  "warranty_callback_open",
];

export function getJobProgressPercent(status: JobStatus): number {
  const progressMap: Partial<Record<JobStatus, number>> = {
    draft: 5,
    submitted: 10,
    awaiting_serviceability: 12,
    awaiting_match: 15,
    offer_sent: 20,
    accepted: 25,
    scheduled: 30,
    deposit_required: 32,
    deposit_paid: 35,
    en_route: 45,
    arrived: 50,
    diagnosis_in_progress: 55,
    quote_submitted: 58,
    awaiting_quote_approval: 60,
    quote_approved: 65,
    in_progress: 75,
    change_order_submitted: 78,
    awaiting_change_order_approval: 80,
    change_order_approved: 82,
    completed_pending_confirmation: 90,
    customer_confirmed: 95,
    completed: 100,
    disputed: 80,
    warranty_callback_open: 92,
    closed: 100,
    cancelled: 0,
    expired: 0,
    no_show: 0,
    refund_pending: 85,
    refunded: 100,
  };
  return progressMap[status] ?? 0;
}
