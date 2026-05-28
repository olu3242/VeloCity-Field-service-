-- Velocity/JIT AI tenant-aware access control settings. Additive only.

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  default_dashboard text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists persona_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  persona_id uuid not null references personas(id) on delete cascade,
  is_active boolean not null default true,
  assigned_by uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, persona_id)
);

create table if not exists permission_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  object_key text not null,
  label text not null,
  description text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, object_key)
);

create table if not exists permission_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  object_key text not null,
  field_key text not null,
  label text not null,
  is_sensitive boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, object_key, field_key)
);

create table if not exists persona_object_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  persona_id uuid not null references personas(id) on delete cascade,
  object_key text not null,
  can_create boolean not null default false,
  can_read boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  can_import boolean not null default false,
  can_assign boolean not null default false,
  can_approve boolean not null default false,
  can_reject boolean not null default false,
  can_suspend boolean not null default false,
  can_refund boolean not null default false,
  can_release_payout boolean not null default false,
  can_override boolean not null default false,
  can_retry boolean not null default false,
  can_view_sensitive boolean not null default false,
  can_manage_settings boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, object_key)
);

create table if not exists persona_field_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  persona_id uuid not null references personas(id) on delete cascade,
  object_key text not null,
  field_key text not null,
  visible boolean not null default true,
  editable boolean not null default false,
  masked boolean not null default false,
  hidden boolean not null default false,
  read_only boolean not null default true,
  required boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, object_key, field_key)
);

create table if not exists persona_action_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  persona_id uuid not null references personas(id) on delete cascade,
  action_key text not null,
  allowed boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, action_key)
);

create table if not exists module_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  persona_id uuid not null references personas(id) on delete cascade,
  module_key text not null,
  can_access boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, module_key)
);

create table if not exists user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  object_key text,
  field_key text,
  action_key text,
  permission jsonb not null default '{}',
  reason text,
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid,
  persona_key text,
  object_key text,
  field_key text,
  action_key text,
  route text,
  decision text not null,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  actor_id uuid,
  setting_type text not null,
  setting_key text not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personas_tenant_key_idx on personas(tenant_id, key);
create index if not exists persona_assignments_tenant_user_idx on persona_assignments(tenant_id, user_id, is_active);
create index if not exists permission_objects_tenant_idx on permission_objects(tenant_id, object_key);
create index if not exists permission_fields_tenant_idx on permission_fields(tenant_id, object_key, field_key);
create index if not exists persona_object_permissions_lookup_idx on persona_object_permissions(persona_id, object_key);
create index if not exists persona_field_permissions_lookup_idx on persona_field_permissions(persona_id, object_key, field_key);
create index if not exists persona_action_permissions_lookup_idx on persona_action_permissions(persona_id, action_key);
create index if not exists module_permissions_lookup_idx on module_permissions(persona_id, module_key);
create index if not exists access_audit_logs_tenant_created_idx on access_audit_logs(tenant_id, created_at desc);
create index if not exists settings_audit_logs_tenant_created_idx on settings_audit_logs(tenant_id, created_at desc);

alter table personas enable row level security;
alter table persona_assignments enable row level security;
alter table permission_objects enable row level security;
alter table permission_fields enable row level security;
alter table persona_object_permissions enable row level security;
alter table persona_field_permissions enable row level security;
alter table persona_action_permissions enable row level security;
alter table module_permissions enable row level security;
alter table user_permission_overrides enable row level security;
alter table access_audit_logs enable row level security;
alter table settings_audit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='personas' and policyname='Tenant admins manage personas') then
    create policy "Tenant admins manage personas" on personas for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_assignments' and policyname='Tenant admins manage persona assignments') then
    create policy "Tenant admins manage persona assignments" on persona_assignments for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='permission_objects' and policyname='Tenant admins manage permission objects') then
    create policy "Tenant admins manage permission objects" on permission_objects for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='permission_fields' and policyname='Tenant admins manage permission fields') then
    create policy "Tenant admins manage permission fields" on permission_fields for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_object_permissions' and policyname='Tenant admins manage object permissions') then
    create policy "Tenant admins manage object permissions" on persona_object_permissions for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_field_permissions' and policyname='Tenant admins manage field permissions') then
    create policy "Tenant admins manage field permissions" on persona_field_permissions for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_action_permissions' and policyname='Tenant admins manage action permissions') then
    create policy "Tenant admins manage action permissions" on persona_action_permissions for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='module_permissions' and policyname='Tenant admins manage module permissions') then
    create policy "Tenant admins manage module permissions" on module_permissions for all using (tenant_id is null or app.is_tenant_admin(tenant_id)) with check (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='access_audit_logs' and policyname='Tenant admins see access audits') then
    create policy "Tenant admins see access audits" on access_audit_logs for select using (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='settings_audit_logs' and policyname='Tenant admins see settings audits') then
    create policy "Tenant admins see settings audits" on settings_audit_logs for select using (tenant_id is null or app.is_tenant_admin(tenant_id));
  end if;
end $$;

insert into personas (tenant_id, key, name, description, is_system, default_dashboard, metadata) values
  (null, 'super_admin', 'Super Admin', 'Platform-wide access, tenant management, and global settings.', true, '/admin/settings', '{}'),
  (app.default_tenant_id(), 'tenant_admin', 'Tenant Admin', 'Full access within one tenant.', true, '/admin/dashboard', '{}'),
  (app.default_tenant_id(), 'dispatcher', 'Dispatcher', 'Jobs, dispatch, provider offers, and status operations.', true, '/admin/jobs', '{}'),
  (app.default_tenant_id(), 'finance_admin', 'Finance Admin', 'Payments, payouts, refunds, subscriptions, and ledger access.', true, '/admin/payments', '{}'),
  (app.default_tenant_id(), 'provider_manager', 'Provider Manager', 'Provider approvals, suspensions, documents, and trust score review.', true, '/admin/providers', '{}'),
  (app.default_tenant_id(), 'provider', 'Provider', 'Assigned jobs, offers, quotes, earnings, and reviews.', true, '/provider/dashboard', '{}'),
  (app.default_tenant_id(), 'customer', 'Customer', 'Own bookings, payments, quotes, disputes, and reviews.', true, '/dashboard', '{}'),
  (app.default_tenant_id(), 'support_agent', 'Support Agent', 'Customer/job support and dispute intake with limited finance visibility.', true, '/admin/disputes', '{}'),
  (app.default_tenant_id(), 'auditor', 'Auditor / Read-only', 'Read-only tenant reporting and audit logs.', true, '/admin/command-center', '{}'),
  (app.default_tenant_id(), 'automation_operator', 'Automation Operator', 'Automation queue, retries, and agent log inspection.', true, '/admin/automation/logs', '{}')
on conflict (tenant_id, key) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  default_dashboard = excluded.default_dashboard,
  updated_at = now();
