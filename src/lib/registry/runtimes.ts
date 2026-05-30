// Canonical runtime registry — single source of truth for all runtime ownership
export type RuntimeStatus = "active" | "partial" | "orphaned" | "planned";

export interface RuntimeDefinition {
  id: string;
  name: string;
  owner: string;
  tables: string[];
  events_produced: string[];
  events_consumed: string[];
  apis: string[];
  dashboards: string[];
  status: RuntimeStatus;
  score: number;
  notes?: string;
}

export const RUNTIME_REGISTRY: RuntimeDefinition[] = [
  {
    id: "marketplace",
    name: "Marketplace Runtime",
    owner: "POST /api/jobs",
    tables: ["jobs", "service_areas", "quotes"],
    events_produced: ["service_request_created", "serviceability_passed", "serviceability_failed"],
    events_consumed: [],
    apis: ["/api/jobs", "/api/quotes", "/api/quotes/[id]"],
    dashboards: ["/book", "/dashboard"],
    status: "active",
    score: 88,
  },
  {
    id: "coverage",
    name: "Coverage Runtime",
    owner: "lib/geo/validateServiceArea",
    tables: ["service_areas"],
    events_produced: ["serviceability_passed", "serviceability_failed"],
    events_consumed: ["service_request_created"],
    apis: [],
    dashboards: [],
    status: "active",
    score: 82,
  },
  {
    id: "alice",
    name: "ALICE Runtime",
    owner: "lib/agents/alice.ts",
    tables: ["agent_logs"],
    events_produced: ["serviceability_passed", "serviceability_failed"],
    events_consumed: ["service_request_created", "serviceability_passed", "serviceability_failed"],
    apis: [],
    dashboards: ["/admin/command-center"],
    status: "active",
    score: 85,
    notes: "Fallback to deterministic classifier when ANTHROPIC_API_KEY absent",
  },
  {
    id: "identity",
    name: "Identity Runtime",
    owner: "lib/identity/index.ts",
    tables: ["profiles", "organizations", "organization_members"],
    events_produced: [],
    events_consumed: [],
    apis: ["/api/auth/signout"],
    dashboards: ["/auth/login", "/auth/signup"],
    status: "partial",
    score: 72,
    notes: "Canonical resolvers exist; auth repair migration pending staging apply",
  },
  {
    id: "access",
    name: "Access Runtime",
    owner: "lib/access/checkPermission.ts",
    tables: ["access_audit_logs", "persona_assignments", "persona_object_permissions"],
    events_produced: [],
    events_consumed: [],
    apis: [],
    dashboards: ["/admin/settings/permissions"],
    status: "active",
    score: 80,
  },
  {
    id: "job",
    name: "Job Runtime",
    owner: "app/api/jobs/[id]/transition/route.ts",
    tables: ["jobs", "job_status_history", "audit_logs"],
    events_produced: ["job_state_changed", "job_accepted", "job_started", "job_completed", "customer_confirmed", "payout_queued", "dispute_opened", "review_requested", "cancellation_fee_applied"],
    events_consumed: ["job_accepted", "job_state_changed", "job_started", "job_completed"],
    apis: ["/api/jobs", "/api/jobs/[id]", "/api/jobs/[id]/transition", "/api/jobs/[id]/check-in", "/api/jobs/[id]/messages", "/api/jobs/[id]/photos"],
    dashboards: ["/dashboard", "/dashboard/jobs/[id]", "/provider/jobs/[id]", "/admin/jobs"],
    status: "active",
    score: 90,
  },
  {
    id: "dispatch",
    name: "Dispatch Runtime",
    owner: "app/api/admin/dispatch/route.ts + lib/agents/max.ts",
    tables: ["provider_offers", "jobs"],
    events_produced: ["provider_offer_sent", "job_state_changed"],
    events_consumed: ["serviceability_passed", "provider_offer_sent", "provider_offer_expired", "job_reassigned", "no_provider_accepted"],
    apis: ["/api/admin/dispatch", "/api/offers/[id]"],
    dashboards: ["/dispatch/dashboard", "/admin/jobs/[id]"],
    status: "active",
    score: 88,
  },
  {
    id: "provider",
    name: "Provider Runtime",
    owner: "app/api/providers/route.ts",
    tables: ["providers", "provider_documents", "provider_tips"],
    events_produced: [],
    events_consumed: ["provider_offer_sent"],
    apis: ["/api/providers", "/api/providers/[id]/status", "/api/admin/providers/[id]/approve"],
    dashboards: ["/provider/dashboard", "/provider/apply", "/admin/providers"],
    status: "active",
    score: 82,
  },
  {
    id: "payments",
    name: "Payments Runtime",
    owner: "app/api/payments/intent + app/api/webhooks/stripe",
    tables: ["payments", "payment_ledger", "payment_retries", "refund_records"],
    events_produced: ["payment_authorized", "payment_captured", "payment_failed", "refund_issued", "payout_queued"],
    events_consumed: ["payment_authorized", "payment_captured", "payment_failed", "refund_requested", "payout_queued", "payout_hold", "payout_released", "payout_failed"],
    apis: ["/api/payments/intent", "/api/webhooks/stripe", "/api/tips"],
    dashboards: ["/dashboard/jobs/[id]/pay", "/admin/payments", "/admin/payouts"],
    status: "active",
    score: 78,
    notes: "Live Stripe blocked by env config",
  },
  {
    id: "revenue",
    name: "Revenue Runtime",
    owner: "lib/revenue/commissionEngine.ts",
    tables: ["payout_queue", "payout_ledger", "payment_ledger"],
    events_produced: ["payout_released", "payout_failed"],
    events_consumed: ["payment_captured", "payout_queued"],
    apis: ["/api/cron/payouts"],
    dashboards: ["/admin/payments", "/provider/earnings"],
    status: "partial",
    score: 68,
    notes: "Commission engine exists; dedicated revenue_records table pending migration",
  },
  {
    id: "franchise",
    name: "Franchise Runtime",
    owner: "app/franchise/dashboard + lib/automation/handlers/tess-territory.ts",
    tables: ["franchise_territories", "service_areas"],
    events_produced: ["daily_territory_analysis", "territory_ready_for_expansion"],
    events_consumed: ["daily_territory_analysis", "high_demand_area_detected", "provider_shortage_detected", "franchise_candidate_area_detected"],
    apis: ["/api/cron/daily"],
    dashboards: ["/franchise/dashboard", "/admin/growth"],
    status: "partial",
    score: 65,
    notes: "Franchise portal exists; royalty attribution pending revenue_records migration",
  },
  {
    id: "notification",
    name: "Notification Runtime",
    owner: "lib/notifications/server.ts",
    tables: ["notifications"],
    events_produced: [],
    events_consumed: ["job_state_changed", "provider_offer_sent", "payment_captured", "dispute_opened"],
    apis: ["/api/notifications"],
    dashboards: ["/dashboard", "/provider/dashboard"],
    status: "partial",
    score: 72,
    notes: "In-app only; email/SMS conditional on env config",
  },
  {
    id: "analytics",
    name: "Analytics Runtime",
    owner: "app/admin/command-center + app/admin/growth",
    tables: ["agent_logs", "automation_queue", "automation_runs", "access_audit_logs"],
    events_produced: ["analytics.recorded"],
    events_consumed: [],
    apis: ["/api/admin/runtime"],
    dashboards: ["/admin/dashboard", "/admin/command-center", "/admin/growth"],
    status: "active",
    score: 84,
  },
  {
    id: "governance",
    name: "Governance Runtime",
    owner: "lib/governance/ + app/admin/lax",
    tables: ["audit_logs", "access_audit_logs", "governance_violations", "agent_logs"],
    events_produced: [],
    events_consumed: [],
    apis: ["/api/admin/runtime", "/api/runtime/trace/[id]"],
    dashboards: ["/admin/lax", "/admin/command-center"],
    status: "active",
    score: 82,
  },
];

export function getRuntimeById(id: string): RuntimeDefinition | undefined {
  return RUNTIME_REGISTRY.find(r => r.id === id);
}

export function getRuntimesByStatus(status: RuntimeStatus): RuntimeDefinition[] {
  return RUNTIME_REGISTRY.filter(r => r.status === status);
}

export function getOverallArchitectureScore(): number {
  const scores = RUNTIME_REGISTRY.map(r => r.score);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
