export type WorkflowStatus = "active" | "partial" | "planned";

export interface WorkflowStep {
  step: string;
  runtime: string;
  event?: string;
  table?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;
  actor: string;
  steps: WorkflowStep[];
  runtimes: string[];
  events: string[];
  tables: string[];
  status: WorkflowStatus;
}

export const WORKFLOW_REGISTRY: WorkflowDefinition[] = [
  {
    id: "customer-booking",
    name: "Customer Creates Job",
    trigger: "POST /api/jobs",
    actor: "customer",
    steps: [
      { step: "Validate booking schema", runtime: "marketplace", table: "jobs" },
      { step: "Validate service area", runtime: "coverage", event: "serviceability_passed" },
      { step: "ALICE classifies job", runtime: "alice", table: "agent_logs" },
      { step: "Persist job", runtime: "job", table: "jobs" },
      { step: "Emit service_request_created", runtime: "job", event: "service_request_created" },
      { step: "Queue → handleAliceIntake", runtime: "alice" },
      { step: "Queue → handleMaxDispatch → provider offers", runtime: "dispatch", event: "provider_offer_sent" },
    ],
    runtimes: ["marketplace", "coverage", "alice", "job", "dispatch"],
    events: ["service_request_created", "serviceability_passed", "provider_offer_sent"],
    tables: ["jobs", "agent_logs", "automation_events", "automation_queue", "provider_offers"],
    status: "active",
  },
  {
    id: "provider-acceptance",
    name: "Provider Accepts Job",
    trigger: "POST /api/offers/[id]",
    actor: "provider",
    steps: [
      { step: "Validate offer ownership", runtime: "provider" },
      { step: "Accept offer, update job status → accepted", runtime: "job", table: "jobs" },
      { step: "Emit job_accepted", runtime: "job", event: "job_accepted" },
      { step: "NOVA orchestrates workflow", runtime: "job" },
      { step: "Notify customer", runtime: "notification", table: "notifications" },
    ],
    runtimes: ["provider", "job", "notification"],
    events: ["job_accepted", "job_state_changed"],
    tables: ["provider_offers", "jobs", "notifications"],
    status: "active",
  },
  {
    id: "dispatcher-assignment",
    name: "Dispatcher Assigns Provider",
    trigger: "POST /api/admin/dispatch",
    actor: "dispatcher",
    steps: [
      { step: "RBAC checkPermission(jobs, assign_provider)", runtime: "access" },
      { step: "MAX ranks available providers", runtime: "dispatch", table: "agent_logs" },
      { step: "Create provider_offers for top 3", runtime: "dispatch", table: "provider_offers" },
      { step: "Update job status → offer_sent", runtime: "job", table: "jobs" },
      { step: "Emit provider_offer_sent per provider", runtime: "dispatch", event: "provider_offer_sent" },
      { step: "Create in-app notifications for providers", runtime: "notification", table: "notifications" },
    ],
    runtimes: ["access", "dispatch", "job", "notification"],
    events: ["job_state_changed", "provider_offer_sent"],
    tables: ["provider_offers", "jobs", "notifications", "agent_logs"],
    status: "active",
  },
  {
    id: "payment-capture",
    name: "Payment Capture",
    trigger: "Stripe webhook: payment_intent.succeeded",
    actor: "system",
    steps: [
      { step: "Validate Stripe webhook signature", runtime: "payments" },
      { step: "Update payment status → escrowed", runtime: "payments", table: "payments" },
      { step: "Update job status based on payment type", runtime: "job", table: "jobs" },
      { step: "Emit payment_captured", runtime: "payments", event: "payment_captured" },
      { step: "FINN handles commission + payout queue", runtime: "revenue", table: "payout_queue" },
      { step: "Record payment_ledger entry", runtime: "payments", table: "payment_ledger" },
    ],
    runtimes: ["payments", "job", "revenue"],
    events: ["payment_authorized", "payment_captured", "payout_queued"],
    tables: ["payments", "jobs", "payment_ledger", "payout_queue"],
    status: "active",
  },
  {
    id: "franchise-attribution",
    name: "Franchise Revenue Attribution",
    trigger: "/api/cron/daily → daily_territory_analysis",
    actor: "system",
    steps: [
      { step: "Cron emits daily_territory_analysis", runtime: "franchise" },
      { step: "TESS analyzes territory demand + supply", runtime: "franchise", table: "service_areas" },
      { step: "Compute franchise royalty from job payments", runtime: "revenue" },
      { step: "Update payout_ledger with franchise share", runtime: "revenue", table: "payout_ledger" },
    ],
    runtimes: ["franchise", "revenue"],
    events: ["daily_territory_analysis", "high_demand_area_detected"],
    tables: ["service_areas", "franchise_territories", "payout_ledger"],
    status: "partial",
  },
  {
    id: "google-oauth",
    name: "Google OAuth Login",
    trigger: "GET /auth/login → signInWithOAuth(google)",
    actor: "user",
    steps: [
      { step: "User clicks Google OAuth button", runtime: "identity" },
      { step: "Supabase redirects to Google", runtime: "identity" },
      { step: "Google callback → /auth/callback", runtime: "identity" },
      { step: "exchangeCodeForSession via PKCE", runtime: "identity" },
      { step: "Bootstrap profile if missing", runtime: "identity", table: "profiles" },
      { step: "Resolve role from profile", runtime: "identity" },
      { step: "Redirect to role portal", runtime: "access" },
    ],
    runtimes: ["identity", "access"],
    events: [],
    tables: ["profiles"],
    status: "partial",
  },
];
