# Access Control Personas

Velocity/JIT AI now has a tenant-aware access-control settings layer.

## Persona Definitions

- Super Admin: platform-wide access, tenant management, global settings.
- Tenant Admin: full access within one tenant.
- Dispatcher: jobs, dispatch, provider offers, and job status operations.
- Finance Admin: payments, payouts, refunds, subscriptions, and ledgers.
- Provider Manager: provider approvals, suspensions, documents, and trust scores.
- Provider: assigned jobs, offers, quotes, earnings, and reviews.
- Customer: own bookings, payments, quotes, disputes, and reviews.
- Support Agent: support context and disputes with limited finance access.
- Auditor / Read-only: reporting and audit visibility without mutation.
- Automation Operator: automation queue, retries, cron visibility, and agent logs.

## Object Permission Model

Object permissions live in `persona_object_permissions` and support:

- create, read, update, delete
- export, import
- assign, approve, reject, suspend
- refund, release payout
- override, retry
- view sensitive
- manage settings

Registered objects include users, tenants, profiles, customers, providers, jobs, quotes, payments, payouts, disputes, reviews, notifications, automation, agent logs, pricing decisions, command center, launch readiness, settings, and audit logs.

## Field Permission Model

Field permissions live in `persona_field_permissions` and support:

- visible
- editable
- masked
- hidden
- read only
- required

Sensitive fields include customer/provider contact data, Stripe IDs, payout metadata, dispute evidence, provider documents, trust score internals, AI prompts/outputs, audit metadata, and tenant settings.

## Action Permissions

Action permissions live in `persona_action_permissions`. Examples:

- Customer: create booking, approve quote, pay invoice, open dispute, submit review.
- Provider: accept/reject offer, update status, submit quote, request payout.
- Dispatcher: assign provider, reassign job, override status, cancel/reopen job.
- Finance: refund, release/hold payout, retry payment, view ledger.
- Admin: approve/suspend provider, manage users/personas/permissions, retry automation, export data.

## Route Access Matrix

- `/admin/settings/*`: Tenant Admin or Super Admin.
- `/admin/jobs/*`: Tenant Admin or Dispatcher.
- `/admin/providers/*`: Tenant Admin or Provider Manager.
- `/admin/payments`, `/admin/payouts`: Tenant Admin or Finance Admin.
- `/admin/automation/logs`: Tenant Admin or Automation Operator.
- `/provider/*`: Provider persona and assigned/offered records only.
- `/dashboard/*`: Customer persona and owned records only.

Middleware still enforces coarse profile role boundaries. Route/API guards enforce persona permissions where added.

## API Protection Checklist

Initial protected actions:

- Dispatch: `assign_provider`
- Provider approval: `approve_provider`
- Payment intent: `pay_invoice`
- Automation processor: `retry_automation`

Remaining API routes should continue receiving `checkPermission()` calls as each workflow is QA-tested.

## RLS Strategy

- RLS remains responsible for tenant isolation through `tenant_id`.
- App-level checks handle complex persona, field, route, and action permissions.
- Service-role automation can process records only when emitted rows carry `tenant_id`.
- Denied app-layer access is logged to `access_audit_logs`.
- Permission/settings changes are logged to `settings_audit_logs`.

## QA Checklist

- Customer cannot access admin.
- Provider cannot see another provider's job.
- Dispatcher can dispatch but cannot release payout.
- Finance Admin can release payout but cannot approve provider unless granted.
- Provider Manager can approve/suspend providers but cannot refund.
- Support Agent can open dispute but cannot release payout.
- Auditor can view reports but cannot edit.
- Automation Operator can retry automation but cannot access payments.
- Tenant Admin can manage tenant users.
- Field masking hides Stripe IDs from non-finance users.
- Denied action logs to `access_audit_logs`.
- Permission change logs to `settings_audit_logs`.
- Tenant isolation is preserved.

Live access control is not `VERIFIED` until tested with seeded demo users against the live tenant database.
