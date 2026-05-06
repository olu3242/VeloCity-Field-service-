export type PersonaKey =
  | "super_admin"
  | "tenant_admin"
  | "dispatcher"
  | "finance_admin"
  | "provider_manager"
  | "provider"
  | "customer"
  | "support_agent"
  | "auditor"
  | "automation_operator";

export type PermissionObject =
  | "users" | "tenants" | "profiles" | "customers" | "providers" | "provider_documents"
  | "services" | "service_areas" | "jobs" | "job_events" | "provider_offers"
  | "quotes" | "quote_line_items" | "change_orders" | "payments" | "payment_ledger"
  | "payouts" | "payout_ledger" | "refunds" | "disputes" | "reviews" | "notifications"
  | "automation_events" | "automation_queue" | "automation_runs" | "agent_logs"
  | "pricing_decisions" | "growth_recommendations" | "command_center" | "launch_readiness"
  | "settings" | "audit_logs";

export type ObjectAction =
  | "create" | "read" | "update" | "delete" | "export" | "import" | "assign" | "approve"
  | "reject" | "suspend" | "refund" | "release_payout" | "override" | "retry"
  | "view_sensitive" | "manage_settings";

export type FieldOperation = "visible" | "editable" | "masked" | "hidden" | "read_only" | "required";

export type AppAction =
  | "create_booking" | "approve_quote" | "reject_quote" | "pay_invoice" | "open_dispute" | "submit_review"
  | "accept_offer" | "reject_offer" | "update_job_status" | "submit_quote" | "submit_change_order"
  | "upload_job_media" | "request_payout" | "assign_provider" | "reassign_job" | "override_job_status"
  | "cancel_job" | "reopen_job" | "create_refund" | "approve_refund" | "release_payout"
  | "hold_payout" | "retry_payment" | "view_ledger" | "approve_provider" | "suspend_provider"
  | "manage_users" | "manage_personas" | "manage_permissions" | "view_agent_logs"
  | "retry_automation" | "manage_cron" | "export_data";

export interface AccessDecision {
  allowed: boolean;
  personaKey?: PersonaKey;
  reason: string;
}

export interface PersonaSummary {
  id?: string;
  key: PersonaKey;
  name: string;
  description: string;
  defaultDashboard: string;
}

export interface CheckPermissionInput {
  tenantId: string;
  userId: string;
  object: PermissionObject;
  action: ObjectAction | AppAction;
  route?: string;
}

export interface CheckFieldPermissionInput {
  tenantId: string;
  userId: string;
  object: PermissionObject;
  field: string;
  operation: FieldOperation;
}

export interface EnforceRouteAccessInput {
  tenantId: string;
  userId: string;
  route: string;
  action: ObjectAction | AppAction;
}
