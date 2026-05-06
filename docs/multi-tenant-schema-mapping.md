# Multi-Tenant Schema Mapping

## Existing Tenant Table Discovered

The linked Supabase project already uses `public.tenants` as the tenant boundary table.

Remote tenant model:

- `tenants.id`
- `tenants.slug`
- `tenants.name`
- `tenants.type`
- `tenants.subscription_tier`
- `tenants.currency`
- `tenants.settings`
- `tenants.platform_fee_percent`

Remote RLS uses `public.current_user_tenant_id()`, which reads `tenant_id` from JWT claims. Existing remote roles are `super_admin`, `tenant_admin`, `artisan`, and `client`.

## Existing Remote Marketplace Tables

The current project already owns these multi-tenant marketplace tables:

- `users`
- `artisans`
- `services`
- `bookings`
- `booking_slots`
- `payments`
- `notifications`
- `system_events`
- `automation_rules`
- `automation_runs`
- `automation_logs`

These tables already include `tenant_id` and tenant-isolation RLS policies.

## Velocity App-Owned Tables

Velocity/JIT AI local migrations add MVP-specific tables that should remain tenant-scoped:

- `profiles`
- `service_areas`
- `providers`
- `customer_addresses`
- `jobs`
- `job_status_history`
- `quotes`
- `reviews`
- `disputes`
- `provider_offers`
- `subscriptions`
- `agent_logs`
- `audit_logs`
- `automation_events`
- `automation_queue`
- growth/franchise tables from `004_growth_intelligence.sql`

Each app-owned table must include `tenant_id` and use tenant-scoped RLS.

## Migration Changes Needed

- Keep `public.tenants`; do not replace it with a new project or new tenant table.
- Local `003_tenant_demarcation.sql` now inserts only `id`, `slug`, and `name` so it is compatible with the existing remote `tenants` table.
- `app.current_tenant_id()` now checks JWT `tenant_id`, then Velocity `profiles`, then existing remote `users`, then the demo fallback tenant.
- `app.is_tenant_admin()` now supports both Velocity `profiles.role = admin` and remote `users.role in (super_admin, tenant_admin)`.
- `005_automation_core.sql` now adapts to existing `automation_runs` and `automation_rules` by adding missing columns instead of assuming fresh table shape.

## RLS Changes Needed

- Velocity RLS must enforce `tenant_id = app.current_tenant_id()` for user-facing operations.
- Admin policies must use `app.is_tenant_admin(tenant_id)`.
- Automation event/queue insert policies must require `tenant_id = app.current_tenant_id()` for authenticated users.
- Service-role cron/worker logic may process across tenants only when every emitted event, queue item, run, and agent log carries `tenant_id`.

## Query/API Changes Needed

Core API routes should:

- Read `profiles.tenant_id` for the authenticated user.
- Filter tenant-scoped reads with `.eq("tenant_id", tenantId)`.
- Include `tenant_id` on inserts.
- Pass `tenantId` into automation emissions and agent context.

Patched areas include booking creation/listing, dispatch, provider offers, job transitions, quote actions, payment intent creation, disputes, reviews, the admin automation processor, and Command Center visibility.

## Seed Changes Needed

- Seed must create or reuse the demo tenant in `public.tenants`.
- Seed must avoid columns not guaranteed by the existing tenant table, such as `status` or `metadata`.
- Seeded app-owned records must include `tenant_id`.

## Automation Mapping

Velocity automation tables:

- `automation_events`: emitted event record with `tenant_id`
- `automation_queue`: processing queue with `tenant_id`, `status`, `retry_count`, `dedup_key`, `error_message`, `processed_at`
- `automation_runs`: processing run records with `tenant_id`; migration adds compatibility columns to existing remote table
- `agent_logs`: AI/automation logs with `tenant_id`
- `audit_logs`: governance/audit records with `tenant_id`

Existing remote equivalents:

- `system_events`: existing remote event bus
- `automation_rules`, `automation_runs`, `automation_logs`: existing remote automation engine tables

Velocity currently keeps `automation_events` and `automation_queue` as app-owned compatibility tables while preserving the existing remote automation engine.

## Pricing and Payments Additive Layer

`007_pricing_payments_automation.sql` adds tenant-scoped financial automation tables without changing existing remote marketplace tables:

- `pricing_decisions`
- `payment_ledger`
- `payout_ledger`
- `refund_records`
- `payment_retries`
- `subscription_events`

These tables are additive and should be applied only after reviewing `006_velocity_additive_bridge.sql`.

## Access-Control Additive Layer

`008_access_control_settings.sql` adds tenant-aware settings and permission tables without renaming existing roles:

- `personas`
- `persona_assignments`
- `permission_objects`
- `permission_fields`
- `persona_object_permissions`
- `persona_field_permissions`
- `persona_action_permissions`
- `module_permissions`
- `user_permission_overrides`
- `access_audit_logs`
- `settings_audit_logs`

Profile roles remain `customer`, `provider`, and `admin`; personas provide the finer access model.

## Commands To Run

Do not run destructive repair commands.

Recommended next commands:

```bash
supabase migration list --linked
npm run type-check
npm run lint
npm run build
```

Because remote migration history diverges from local Velocity migrations, do not run `supabase db push` from the full local stack. Review and apply only `006_velocity_additive_bridge.sql` and `007_pricing_payments_automation.sql` manually through Supabase SQL Editor or `psql`, then run `npm run db:seed` after the additive schema exists. Do not mark automation or payment flows `VERIFIED` until the live E2E proof succeeds for a specific tenant.
