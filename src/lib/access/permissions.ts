import type { AppAction, ObjectAction, PermissionObject, PersonaKey, PersonaSummary } from "./types";

export const DEFAULT_PERSONAS: Record<PersonaKey, PersonaSummary> = {
  super_admin: { key: "super_admin", name: "Super Admin", description: "Platform-wide access.", defaultDashboard: "/admin/settings" },
  tenant_admin: { key: "tenant_admin", name: "Tenant Admin", description: "Full tenant administration.", defaultDashboard: "/admin/dashboard" },
  dispatcher: { key: "dispatcher", name: "Dispatcher", description: "Dispatch and job operations.", defaultDashboard: "/admin/jobs" },
  finance_admin: { key: "finance_admin", name: "Finance Admin", description: "Finance and payout operations.", defaultDashboard: "/admin/payments" },
  provider_manager: { key: "provider_manager", name: "Provider Manager", description: "Provider approvals and quality.", defaultDashboard: "/admin/providers" },
  provider: { key: "provider", name: "Provider", description: "Provider workbench.", defaultDashboard: "/provider/dashboard" },
  customer: { key: "customer", name: "Customer", description: "Customer bookings and payments.", defaultDashboard: "/dashboard" },
  support_agent: { key: "support_agent", name: "Support Agent", description: "Customer and dispute support.", defaultDashboard: "/admin/disputes" },
  auditor: { key: "auditor", name: "Auditor / Read-only", description: "Read-only reporting and audit.", defaultDashboard: "/admin/command-center" },
  automation_operator: { key: "automation_operator", name: "Automation Operator", description: "Automation queue and agent logs.", defaultDashboard: "/admin/automation/logs" },
};

export const PERMISSION_OBJECTS: PermissionObject[] = [
  "users", "tenants", "profiles", "customers", "providers", "provider_documents", "services", "service_areas",
  "jobs", "job_events", "provider_offers", "quotes", "quote_line_items", "change_orders", "payments",
  "payment_ledger", "payouts", "payout_ledger", "refunds", "disputes", "reviews", "notifications",
  "automation_events", "automation_queue", "automation_runs", "agent_logs", "pricing_decisions",
  "growth_recommendations", "command_center", "launch_readiness", "settings", "audit_logs",
];

export const OBJECT_ACTIONS: ObjectAction[] = [
  "create", "read", "update", "delete", "export", "import", "assign", "approve", "reject", "suspend",
  "refund", "release_payout", "override", "retry", "view_sensitive", "manage_settings",
];

export const APP_ACTIONS: AppAction[] = [
  "create_booking", "approve_quote", "reject_quote", "pay_invoice", "open_dispute", "submit_review",
  "accept_offer", "reject_offer", "update_job_status", "submit_quote", "submit_change_order", "upload_job_media",
  "request_payout", "assign_provider", "reassign_job", "override_job_status", "cancel_job", "reopen_job",
  "create_refund", "approve_refund", "release_payout", "hold_payout", "retry_payment", "view_ledger",
  "approve_provider", "suspend_provider", "manage_users", "manage_personas", "manage_permissions",
  "view_agent_logs", "retry_automation", "manage_cron", "export_data",
];

export const SENSITIVE_FIELDS = [
  { object: "profiles", field: "phone", label: "Customer/provider phone" },
  { object: "profiles", field: "email", label: "Customer/provider email" },
  { object: "profiles", field: "stripe_customer_id", label: "Stripe customer ID" },
  { object: "payments", field: "amount_cents", label: "Payment amount" },
  { object: "payments", field: "stripe_payment_intent_id", label: "Stripe payment intent ID" },
  { object: "payout_ledger", field: "metadata", label: "Payout account/internal metadata" },
  { object: "disputes", field: "evidence_urls", label: "Dispute evidence" },
  { object: "providers", field: "documents", label: "Provider documents" },
  { object: "providers", field: "trust_score", label: "Trust score internals" },
  { object: "agent_logs", field: "input", label: "AI agent prompts" },
  { object: "agent_logs", field: "output", label: "AI agent outputs" },
  { object: "audit_logs", field: "metadata", label: "Audit log metadata" },
  { object: "tenants", field: "settings", label: "Tenant settings" },
] as const;

const fullObjects = new Set<PermissionObject>(PERMISSION_OBJECTS);
const readOnlyObjects = new Set<PermissionObject>(["jobs", "providers", "payments", "payout_ledger", "disputes", "reviews", "automation_events", "automation_queue", "agent_logs", "command_center", "audit_logs"]);

export function fallbackObjectAllowed(persona: PersonaKey, object: PermissionObject, action: ObjectAction): boolean {
  if (persona === "super_admin" || persona === "tenant_admin") return true;
  if (persona === "auditor") return action === "read" && readOnlyObjects.has(object);
  if (persona === "dispatcher") return ["jobs", "provider_offers", "providers", "notifications"].includes(object) && ["create", "read", "update", "assign", "override"].includes(action);
  if (persona === "finance_admin") return ["payments", "payment_ledger", "payouts", "payout_ledger", "refunds", "pricing_decisions", "command_center"].includes(object) && ["create", "read", "update", "refund", "release_payout", "retry", "view_sensitive", "export"].includes(action);
  if (persona === "provider_manager") return ["providers", "provider_documents", "reviews", "audit_logs"].includes(object) && ["read", "update", "approve", "reject", "suspend", "view_sensitive"].includes(action);
  if (persona === "automation_operator") return ["automation_events", "automation_queue", "automation_runs", "agent_logs"].includes(object) && ["read", "retry", "update"].includes(action);
  if (persona === "support_agent") return ["jobs", "customers", "profiles", "disputes", "reviews", "notifications"].includes(object) && ["create", "read", "update"].includes(action);
  if (persona === "provider") return ["jobs", "provider_offers", "quotes", "reviews", "payout_ledger"].includes(object) && ["create", "read", "update"].includes(action);
  if (persona === "customer") return ["jobs", "quotes", "payments", "disputes", "reviews", "notifications"].includes(object) && ["create", "read", "update"].includes(action);
  return fullObjects.has(object) && action === "read";
}

export function fallbackActionAllowed(persona: PersonaKey, action: AppAction): boolean {
  if (persona === "super_admin" || persona === "tenant_admin") return true;
  const grants: Record<PersonaKey, AppAction[]> = {
    super_admin: APP_ACTIONS,
    tenant_admin: APP_ACTIONS,
    dispatcher: ["assign_provider", "reassign_job", "override_job_status", "cancel_job", "reopen_job", "update_job_status"],
    finance_admin: ["create_refund", "approve_refund", "release_payout", "hold_payout", "retry_payment", "view_ledger", "export_data"],
    provider_manager: ["approve_provider", "suspend_provider"],
    provider: ["accept_offer", "reject_offer", "update_job_status", "submit_quote", "submit_change_order", "upload_job_media", "request_payout"],
    customer: ["create_booking", "approve_quote", "reject_quote", "pay_invoice", "open_dispute", "submit_review"],
    support_agent: ["open_dispute", "cancel_job", "reopen_job"],
    auditor: ["export_data"],
    automation_operator: ["view_agent_logs", "retry_automation", "manage_cron"],
  };
  return grants[persona]?.includes(action) ?? false;
}

export function mapRoleToPersona(role?: string | null): PersonaKey {
  if (role === "admin") return "tenant_admin";
  if (role === "provider") return "provider";
  return "customer";
}
