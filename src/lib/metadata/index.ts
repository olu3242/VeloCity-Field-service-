/**
 * IDXF — Metadata bootstrap.
 *
 * Registers the platform's core business objects against their real backing
 * tables. Importing this module is what populates the runtime: every other
 * IDXF engine reads from these registries rather than holding its own schema.
 *
 * Registration is idempotent — the registries are keyed maps, so a repeat import
 * overwrites with identical values rather than duplicating.
 */

import { registerEntity } from "./entity-registry";
import { registerRelationships } from "./relationship-registry";
import { captureSchema } from "./schema-registry";

export * from "./field-engine";
export * from "./entity-registry";
export * from "./relationship-registry";
export * from "./schema-registry";

let bootstrapped = false;

/**
 * Registers core entities, fields and relationships.
 *
 * Field names mirror the actual Supabase columns so lookups, aggregates and
 * validation resolve against real data rather than an invented schema.
 */
export function bootstrapMetadata(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // ── Customer (profiles) ─────────────────────────────────────────────────
  registerEntity({
    key: "customer",
    label: "Customer",
    domain: "crm",
    table: "profiles",
    displayField: "full_name",
    extraWorkspaceTabs: ["Loyalty", "Conversations"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "full_name", kind: "text", label: "Full Name", group: "General", order: 1, searchable: true, validation: { required: true, minLength: 2, maxLength: 120 } },
      { name: "phone", kind: "text", group: "Contact", order: 2, searchable: true, validation: { format: "phone" } },
      { name: "role", kind: "text", group: "General", order: 3, validation: { required: true } },
      { name: "avatar_url", kind: "image", label: "Avatar", group: "General", order: 4, validation: {} },
      { name: "stripe_customer_id", kind: "text", label: "Stripe Customer", group: "Billing", order: 5, sensitive: true, validation: {} },
      { name: "created_at", kind: "date", label: "Created", group: "System", order: 90, readOnly: true, validation: {} },
      // Derived: aggregate over the customer's jobs.
      { name: "job_count", kind: "aggregate", label: "Total Jobs", group: "Insights", order: 20, aggregate: { relationship: "jobs", fn: "COUNT" }, validation: {} },
      { name: "lifetime_value_cents", kind: "aggregate", label: "Lifetime Value", group: "Insights", order: 21, aggregate: { relationship: "payments", fn: "SUM", field: "amount_cents" }, validation: {} },
      { name: "avg_rating", kind: "aggregate", label: "Average Rating", group: "Insights", order: 22, aggregate: { relationship: "reviews", fn: "AVG", field: "rating" }, validation: {} },
    ],
  });

  // ── Provider ────────────────────────────────────────────────────────────
  registerEntity({
    key: "provider",
    label: "Provider",
    domain: "operations",
    table: "providers",
    displayField: "business_name",
    statusField: "status",
    activeStatuses: ["active", "approved", "verified"],
    extraWorkspaceTabs: ["Skills", "Certifications", "Wallet", "Recognition"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "user_id", kind: "lookup", label: "User", targetEntity: "customer", group: "General", order: 1, related: true, validation: {} },
      { name: "business_name", kind: "text", label: "Business Name", group: "General", order: 2, searchable: true, validation: { required: true, minLength: 2, maxLength: 200 } },
      { name: "business_license", kind: "text", label: "Business License", group: "Compliance", order: 3, validation: {} },
      { name: "insurance_number", kind: "text", label: "Insurance Number", group: "Compliance", order: 4, sensitive: true, validation: {} },
      { name: "insurance_expiry", kind: "date", label: "Insurance Expiry", group: "Compliance", order: 5, validation: { businessRules: ["insurance_not_expired"] } },
      { name: "status", kind: "text", group: "General", order: 6, validation: { required: true } },
      { name: "hourly_rate_cents", kind: "currency", label: "Hourly Rate", group: "Commercial", order: 7, validation: { min: 0 } },
      { name: "service_radius_miles", kind: "number", label: "Service Radius", group: "Coverage", order: 8, validation: { min: 0, max: 500 } },
      { name: "years_experience", kind: "number", label: "Years Experience", group: "General", order: 9, validation: { min: 0, max: 80 } },
      { name: "trust_score", kind: "score", label: "Trust Score", group: "Insights", order: 20, formula: "ROUND(100 - (cancellation_rate * 100), 0)", validation: { min: 0, max: 100 } },
      { name: "completed_jobs", kind: "number", label: "Completed Jobs", group: "Insights", order: 21, readOnly: true, validation: { min: 0 } },
      { name: "cancellation_rate", kind: "percentage", label: "Cancellation Rate", group: "Insights", order: 22, validation: { min: 0, max: 1 } },
      { name: "response_time_minutes", kind: "number", label: "Response Time", group: "Insights", order: 23, validation: { min: 0 } },
      { name: "is_online", kind: "boolean", label: "Online", group: "Availability", order: 24, validation: {} },
      { name: "last_location", kind: "gps", label: "Last Location", group: "Coverage", order: 25, validation: {} },
      { name: "stripe_account_id", kind: "text", label: "Stripe Account", group: "Billing", order: 30, sensitive: true, validation: {} },
      { name: "dispatch_confidence", kind: "kpi", label: "Dispatch Confidence", group: "Insights", order: 26, formula: "ROUND((trust_score * 0.6) + ((100 - MIN(response_time_minutes, 100)) * 0.4), 1)", validation: { min: 0, max: 100 } },
    ],
  });

  // ── Job ─────────────────────────────────────────────────────────────────
  registerEntity({
    key: "job",
    label: "Job",
    domain: "operations",
    table: "jobs",
    displayField: "title",
    statusField: "status",
    activeStatuses: ["pending", "assigned", "accepted", "en_route", "in_progress"],
    extraWorkspaceTabs: ["Dispatch", "Photos"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "customer_id", kind: "lookup", label: "Customer", targetEntity: "customer", group: "Parties", order: 1, searchable: true, related: true, aiSuggestions: true, validation: { required: true } },
      // activeOnly is enforced by cross-record validation against the referenced
      // provider. The 'provider_active' business rule is NOT declared here: rules
      // evaluate the local record, and a job's own `status` field means the job's
      // lifecycle, not the provider's — wiring it here would reject every job
      // whose own status was not "active".
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Parties", order: 2, searchable: true, related: true, aiSuggestions: true, validation: { activeOnly: true } },
      { name: "title", kind: "text", group: "General", order: 3, searchable: true, validation: { required: true, minLength: 3, maxLength: 200 } },
      { name: "description", kind: "text", group: "General", order: 4, searchable: true, validation: { maxLength: 4000 } },
      { name: "category", kind: "text", group: "General", order: 5, validation: { required: true } },
      { name: "urgency", kind: "text", group: "Scheduling", order: 6, validation: {} },
      { name: "status", kind: "text", group: "General", order: 7, validation: { required: true } },
      { name: "city", kind: "text", group: "Location", order: 10, searchable: true, validation: {} },
      { name: "state", kind: "text", group: "Location", order: 11, validation: {} },
      { name: "zip", kind: "text", group: "Location", order: 12, validation: { format: "postal_code" } },
      { name: "location", kind: "gps", label: "Coordinates", group: "Location", order: 13, validation: {} },
      { name: "scheduled_start", kind: "date", label: "Scheduled Start", group: "Scheduling", order: 14, defaultRule: "next_available_slot", validation: {} },
      { name: "scheduled_end", kind: "date", label: "Scheduled End", group: "Scheduling", order: 15, validation: { businessRules: ["end_after_start"] } },
      { name: "estimated_cost_cents", kind: "currency", label: "Estimated Cost", group: "Financial", order: 20, validation: { min: 0 } },
      { name: "quoted_cost_cents", kind: "currency", label: "Quoted Cost", group: "Financial", order: 21, validation: { min: 0 } },
      { name: "final_cost_cents", kind: "currency", label: "Final Cost", group: "Financial", order: 22, validation: { min: 0 } },
      { name: "deposit_amount_cents", kind: "currency", label: "Deposit", group: "Financial", order: 23, validation: { min: 0 } },
      { name: "platform_fee_cents", kind: "formula", label: "Platform Fee", group: "Financial", order: 24, formula: "ROUND(final_cost_cents * 0.15, 0)", validation: { min: 0 } },
      { name: "provider_payout_cents", kind: "formula", label: "Provider Payout", group: "Financial", order: 25, formula: "final_cost_cents - platform_fee_cents - deposit_amount_cents", validation: {} },
      { name: "ai_classification", kind: "ai_summary", label: "AI Classification", group: "AI", order: 40, aiSuggestions: true, validation: {} },
      { name: "created_at", kind: "date", label: "Created", group: "System", order: 90, readOnly: true, validation: {} },
    ],
  });

  // ── Payment ─────────────────────────────────────────────────────────────
  registerEntity({
    key: "payment",
    label: "Payment",
    domain: "finance",
    table: "payments",
    displayField: "id",
    statusField: "status",
    activeStatuses: ["pending", "processing", "succeeded"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "customer_id", kind: "lookup", label: "Customer", targetEntity: "customer", group: "Links", order: 2, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 3, related: true, validation: {} },
      { name: "amount_cents", kind: "currency", label: "Amount", group: "Financial", order: 4, validation: { required: true, min: 0 } },
      { name: "platform_fee_cents", kind: "currency", label: "Platform Fee", group: "Financial", order: 5, validation: { min: 0 } },
      { name: "provider_payout_cents", kind: "formula", label: "Provider Payout", group: "Financial", order: 6, formula: "amount_cents - platform_fee_cents", validation: {} },
      { name: "currency", kind: "text", group: "Financial", order: 7, validation: { required: true, maxLength: 3 } },
      { name: "status", kind: "text", group: "General", order: 8, validation: { required: true } },
      { name: "type", kind: "text", group: "General", order: 9, validation: {} },
      { name: "stripe_payment_intent_id", kind: "text", label: "Stripe Intent", group: "Billing", order: 10, sensitive: true, validation: {} },
      { name: "captured_at", kind: "date", label: "Captured", group: "System", order: 90, validation: {} },
    ],
  });

  // ── Membership (subscriptions) ──────────────────────────────────────────
  registerEntity({
    key: "membership",
    label: "Membership",
    domain: "finance",
    table: "subscriptions",
    displayField: "plan_name",
    statusField: "status",
    activeStatuses: ["active", "trialing"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "customer_id", kind: "lookup", label: "Customer", targetEntity: "customer", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 2, related: true, validation: {} },
      { name: "plan_name", kind: "text", label: "Plan", group: "General", order: 3, searchable: true, validation: { required: true } },
      { name: "category", kind: "text", group: "General", order: 4, validation: {} },
      { name: "interval", kind: "text", group: "Billing", order: 5, validation: { required: true } },
      { name: "amount_cents", kind: "currency", label: "Amount", group: "Billing", order: 6, validation: { required: true, min: 0 } },
      { name: "status", kind: "text", group: "General", order: 7, validation: { required: true } },
      { name: "next_service_date", kind: "date", label: "Next Service", group: "Scheduling", order: 8, defaultRule: "membership_next_service", validation: {} },
      { name: "annualized_value_cents", kind: "formula", label: "Annualized Value", group: "Insights", order: 20, formula: "CASE(interval, 'month', amount_cents * 12, 'year', amount_cents, amount_cents)", validation: {} },
    ],
  });

  // ── Review ──────────────────────────────────────────────────────────────
  registerEntity({
    key: "review",
    label: "Review",
    domain: "crm",
    table: "reviews",
    displayField: "id",
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "customer_id", kind: "lookup", label: "Customer", targetEntity: "customer", group: "Links", order: 2, related: true, validation: {} },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 3, related: true, validation: {} },
      { name: "rating", kind: "number", group: "Feedback", order: 4, validation: { required: true, min: 1, max: 5 } },
      { name: "comment", kind: "text", group: "Feedback", order: 5, searchable: true, validation: { maxLength: 2000 } },
    ],
  });

  // ── Dispute ─────────────────────────────────────────────────────────────
  registerEntity({
    key: "dispute",
    label: "Dispute",
    domain: "compliance",
    table: "disputes",
    displayField: "id",
    statusField: "status",
    activeStatuses: ["open", "under_review", "escalated"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "status", kind: "text", group: "General", order: 2, validation: { required: true } },
    ],
  });

  // ── Territory (service_areas) ───────────────────────────────────────────
  registerEntity({
    key: "territory",
    label: "Territory",
    domain: "franchise",
    table: "service_areas",
    displayField: "name",
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "name", kind: "text", group: "General", order: 1, searchable: true, validation: { required: true } },
    ],
  });

  // ── Quote ───────────────────────────────────────────────────────────────
  registerEntity({
    key: "quote",
    label: "Quote",
    domain: "finance",
    table: "quotes",
    displayField: "id",
    extraWorkspaceTabs: ["Line Items"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 2, related: true, validation: { activeOnly: true } },
      { name: "is_change_order", kind: "boolean", label: "Change Order", group: "General", order: 3, validation: {} },
      { name: "parent_quote_id", kind: "parent", label: "Parent Quote", targetEntity: "quote", group: "Links", order: 4, validation: {} },
      { name: "subtotal_cents", kind: "currency", label: "Subtotal", group: "Financial", order: 10, validation: { required: true, min: 0 } },
      { name: "tax_cents", kind: "currency", label: "Tax", group: "Financial", order: 11, validation: { min: 0 } },
      { name: "deposit_required_cents", kind: "currency", label: "Deposit Required", group: "Financial", order: 12, validation: { min: 0 } },
      // total is derived, so a quote whose stored total disagrees with its parts
      // shows up immediately as a shadow divergence.
      { name: "total_cents", kind: "formula", label: "Total", group: "Financial", order: 13, formula: "subtotal_cents + tax_cents", validation: { min: 0 } },
      { name: "notes", kind: "text", group: "General", order: 20, searchable: true, validation: { maxLength: 4000 } },
      { name: "valid_until", kind: "date", label: "Valid Until", group: "Scheduling", order: 21, validation: { businessRules: ["quote_not_expired"] } },
      { name: "approved_at", kind: "date", label: "Approved", group: "System", order: 90, validation: {} },
      { name: "created_at", kind: "date", label: "Created", group: "System", order: 91, readOnly: true, validation: {} },
    ],
  });

  // ── Offer (provider_offers) ─────────────────────────────────────────────
  registerEntity({
    key: "offer",
    label: "Offer",
    domain: "operations",
    table: "provider_offers",
    displayField: "id",
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 2, related: true, aiSuggestions: true, validation: { required: true, activeOnly: true } },
      // Stored by the AI matching engine, not derived. Declaring it as a
      // calculated `score` would need a formula, and any formula naming the
      // field itself is a self-cycle the dependency graph rightly rejects.
      { name: "match_score", kind: "number", label: "Match Score", group: "Insights", order: 3, validation: { min: 0, max: 100 } },
      { name: "ai_reasoning", kind: "ai_summary", label: "AI Reasoning", group: "AI", order: 4, validation: {} },
      { name: "offered_at", kind: "date", label: "Offered", group: "Scheduling", order: 10, validation: {} },
      { name: "expires_at", kind: "date", label: "Expires", group: "Scheduling", order: 11, validation: { businessRules: ["offer_expiry_after_offered"] } },
      { name: "rejection_reason", kind: "text", label: "Rejection Reason", group: "General", order: 20, validation: { maxLength: 1000 } },
    ],
  });

  // ── Tip (provider_tips) ─────────────────────────────────────────────────
  registerEntity({
    key: "tip",
    label: "Tip",
    domain: "finance",
    table: "provider_tips",
    displayField: "id",
    statusField: "payment_status",
    activeStatuses: ["pending", "processing", "succeeded"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "customer_id", kind: "lookup", label: "Customer", targetEntity: "customer", group: "Links", order: 2, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 3, related: true, validation: { required: true } },
      { name: "amount_cents", kind: "currency", label: "Amount", group: "Financial", order: 4, validation: { required: true, min: 1 } },
      { name: "currency", kind: "text", group: "Financial", order: 5, validation: { maxLength: 3 } },
      { name: "payment_status", kind: "text", label: "Payment Status", group: "General", order: 6, validation: { required: true } },
      { name: "note", kind: "text", group: "General", order: 7, searchable: true, validation: { maxLength: 500 } },
      { name: "stripe_payment_intent_id", kind: "text", label: "Stripe Intent", group: "Billing", order: 10, sensitive: true, validation: {} },
      { name: "idempotency_key", kind: "text", label: "Idempotency Key", group: "System", order: 90, sensitive: true, validation: {} },
    ],
  });

  // ── Notification ────────────────────────────────────────────────────────
  registerEntity({
    key: "notification",
    label: "Notification",
    domain: "platform",
    table: "notifications",
    displayField: "title",
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "user_id", kind: "lookup", label: "Recipient", targetEntity: "customer", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "channel", kind: "text", group: "Delivery", order: 2, validation: { required: true } },
      { name: "title", kind: "text", group: "Content", order: 3, searchable: true, validation: { required: true, maxLength: 200 } },
      { name: "body", kind: "text", group: "Content", order: 4, searchable: true, validation: { maxLength: 2000 } },
      { name: "is_read", kind: "boolean", label: "Read", group: "Delivery", order: 5, validation: {} },
      { name: "sent_at", kind: "date", label: "Sent", group: "System", order: 90, validation: {} },
      { name: "read_at", kind: "date", label: "Read At", group: "System", order: 91, validation: { businessRules: ["read_after_sent"] } },
    ],
  });

  // ── Payout (payout_queue) ───────────────────────────────────────────────
  registerEntity({
    key: "payout",
    label: "Payout",
    domain: "finance",
    table: "payout_queue",
    displayField: "id",
    statusField: "status",
    activeStatuses: ["queued", "pending", "processing"],
    fields: [
      { name: "id", kind: "text", group: "General", order: 0, readOnly: true, validation: { format: "uuid" } },
      { name: "job_id", kind: "lookup", label: "Job", targetEntity: "job", group: "Links", order: 1, related: true, validation: { required: true } },
      { name: "provider_id", kind: "lookup", label: "Provider", targetEntity: "provider", group: "Links", order: 2, related: true, validation: { required: true } },
      { name: "amount_cents", kind: "currency", label: "Gross Amount", group: "Financial", order: 3, validation: { required: true, min: 0 } },
      { name: "platform_fee_cents", kind: "currency", label: "Platform Fee", group: "Financial", order: 4, validation: { min: 0 } },
      // Derived, so a stored net that disagrees with gross minus fee surfaces
      // as a divergence rather than silently paying out the wrong figure.
      { name: "net_payout_cents", kind: "formula", label: "Net Payout", group: "Financial", order: 5, formula: "amount_cents - platform_fee_cents", validation: { min: 0 } },
      { name: "status", kind: "text", group: "General", order: 6, validation: { required: true } },
      { name: "hold_reason", kind: "text", label: "Hold Reason", group: "General", order: 7, validation: { maxLength: 500 } },
      { name: "release_after", kind: "date", label: "Release After", group: "Scheduling", order: 8, validation: {} },
      { name: "attempts", kind: "number", group: "System", order: 90, validation: { min: 0 } },
      { name: "error_message", kind: "text", label: "Error", group: "System", order: 91, validation: { maxLength: 2000 } },
    ],
  });

  // ── Relationships ───────────────────────────────────────────────────────
  registerRelationships([
    { name: "jobs", from: "customer", to: "job", cardinality: "one_to_many", foreignKey: "customer_id", inverseName: "customer", weight: 0.95, label: "Jobs" },
    { name: "payments", from: "customer", to: "payment", cardinality: "one_to_many", foreignKey: "customer_id", inverseName: "customer", weight: 0.85, label: "Payments" },
    { name: "memberships", from: "customer", to: "membership", cardinality: "one_to_many", foreignKey: "customer_id", inverseName: "customer", weight: 0.8, label: "Memberships" },
    { name: "reviews", from: "customer", to: "review", cardinality: "one_to_many", foreignKey: "customer_id", inverseName: "customer", weight: 0.6, label: "Reviews" },

    { name: "jobs", from: "provider", to: "job", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.95, label: "Jobs" },
    { name: "payments", from: "provider", to: "payment", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.8, label: "Payouts" },
    { name: "reviews", from: "provider", to: "review", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.75, label: "Reviews" },

    { name: "customer", from: "job", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "jobs", weight: 0.95, label: "Customer" },
    { name: "provider", from: "job", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "jobs", weight: 0.95, label: "Provider" },
    { name: "payments", from: "job", to: "payment", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.9, label: "Payments" },
    { name: "reviews", from: "job", to: "review", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.7, label: "Reviews" },
    { name: "disputes", from: "job", to: "dispute", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.85, label: "Disputes" },

    { name: "job", from: "payment", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "payments", weight: 0.9, label: "Job" },
    { name: "customer", from: "payment", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "payments", weight: 0.85, label: "Customer" },
    { name: "provider", from: "payment", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "payments", weight: 0.8, label: "Provider" },

    { name: "customer", from: "membership", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "memberships", weight: 0.8, label: "Customer" },
    { name: "job", from: "review", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "reviews", weight: 0.7, label: "Job" },
    { name: "customer", from: "review", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "reviews", weight: 0.6, label: "Customer" },
    { name: "provider", from: "review", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "reviews", weight: 0.75, label: "Provider" },
    { name: "job", from: "dispute", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "disputes", weight: 0.85, label: "Job" },

    // Quotes, offers, tips and payouts all hang off a job.
    { name: "quotes", from: "job", to: "quote", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.85, label: "Quotes" },
    { name: "offers", from: "job", to: "offer", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.8, label: "Offers" },
    { name: "tips", from: "job", to: "tip", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.6, label: "Tips" },
    { name: "payouts", from: "job", to: "payout", cardinality: "one_to_many", foreignKey: "job_id", inverseName: "job", weight: 0.85, label: "Payouts" },

    { name: "job", from: "quote", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "quotes", weight: 0.85, label: "Job" },
    { name: "provider", from: "quote", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "quotes", weight: 0.7, label: "Provider" },
    { name: "job", from: "offer", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "offers", weight: 0.8, label: "Job" },
    { name: "provider", from: "offer", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "offers", weight: 0.8, label: "Provider" },
    { name: "job", from: "tip", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "tips", weight: 0.6, label: "Job" },
    { name: "provider", from: "tip", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "tips", weight: 0.7, label: "Provider" },
    { name: "job", from: "payout", to: "job", cardinality: "many_to_one", foreignKey: "id", inverseName: "payouts", weight: 0.85, label: "Job" },
    { name: "provider", from: "payout", to: "provider", cardinality: "many_to_one", foreignKey: "id", inverseName: "payouts", weight: 0.9, label: "Provider" },

    // Provider-side inverses so a provider workspace surfaces its own pipeline.
    { name: "quotes", from: "provider", to: "quote", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.7, label: "Quotes" },
    { name: "offers", from: "provider", to: "offer", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.8, label: "Offers" },
    { name: "tips", from: "provider", to: "tip", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.7, label: "Tips" },
    { name: "payouts", from: "provider", to: "payout", cardinality: "one_to_many", foreignKey: "provider_id", inverseName: "provider", weight: 0.9, label: "Payouts" },

    { name: "notifications", from: "customer", to: "notification", cardinality: "one_to_many", foreignKey: "user_id", inverseName: "user", weight: 0.4, label: "Notifications" },
    { name: "user", from: "notification", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "notifications", weight: 0.4, label: "Recipient" },
    { name: "tips", from: "customer", to: "tip", cardinality: "one_to_many", foreignKey: "customer_id", inverseName: "customer", weight: 0.5, label: "Tips" },
    { name: "customer", from: "tip", to: "customer", cardinality: "many_to_one", foreignKey: "id", inverseName: "tips", weight: 0.5, label: "Customer" },
  ]);

  // Version every entity so drift against the live registry is detectable.
  for (const entity of [
    "customer", "provider", "job", "payment", "membership", "review", "dispute", "territory",
    "quote", "offer", "tip", "notification", "payout",
  ]) {
    captureSchema(entity, "IDXF bootstrap");
  }
}

// Bootstrap on import so any consumer of the metadata registries sees a
// populated runtime without needing to sequence an explicit init call.
bootstrapMetadata();
