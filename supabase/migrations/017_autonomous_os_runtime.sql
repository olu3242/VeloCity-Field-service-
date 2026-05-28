-- VeloCity Field Service - Autonomous OS runtime primitives
-- Persistent intelligence, AI governance, metering, plugin, webhook, and incident state.

create table if not exists operational_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  system text not null,
  title text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  correlation_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists ai_execution_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  actor_id uuid references profiles(id),
  agent text not null,
  domain text not null,
  action text not null,
  confidence numeric not null default 0,
  decision text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost_usd numeric not null default 0,
  latency_ms integer not null default 0,
  fallback_used boolean not null default false,
  approved boolean not null default false,
  correlation_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists usage_meter_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  subject_id uuid,
  metric text not null,
  quantity numeric not null default 1,
  unit_cost_usd numeric not null default 0,
  total_cost_usd numeric generated always as (quantity * unit_cost_usd) stored,
  source text not null default 'platform',
  correlation_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  name text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  url text not null,
  events text[] not null default '{}',
  secret_hash text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  failure_count integer not null default 0,
  last_delivery_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plugin_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  plugin_id text not null,
  plugin_type text not null,
  version text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  permissions text[] not null default '{}',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, plugin_id)
);

create index if not exists operational_alerts_tenant_status_idx on operational_alerts(tenant_id, status, severity, created_at desc);
create index if not exists ai_execution_audits_tenant_agent_idx on ai_execution_audits(tenant_id, agent, created_at desc);
create index if not exists usage_meter_events_tenant_metric_idx on usage_meter_events(tenant_id, metric, created_at desc);
create index if not exists platform_api_keys_hash_idx on platform_api_keys(key_hash);
create index if not exists webhook_subscriptions_tenant_idx on webhook_subscriptions(tenant_id, status);
create index if not exists plugin_installations_tenant_idx on plugin_installations(tenant_id, status);

alter table operational_alerts enable row level security;
alter table ai_execution_audits enable row level security;
alter table usage_meter_events enable row level security;
alter table platform_api_keys enable row level security;
alter table webhook_subscriptions enable row level security;
alter table plugin_installations enable row level security;

create policy "Tenant admins manage operational alerts" on operational_alerts
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy "Tenant admins read AI audits" on ai_execution_audits
  for select using (app.is_tenant_admin(tenant_id));

create policy "Tenant admins read usage meter events" on usage_meter_events
  for select using (app.is_tenant_admin(tenant_id));

create policy "Tenant admins manage platform api keys" on platform_api_keys
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy "Tenant admins manage webhook subscriptions" on webhook_subscriptions
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy "Tenant admins manage plugin installations" on plugin_installations
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

