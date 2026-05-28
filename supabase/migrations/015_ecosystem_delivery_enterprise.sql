-- VeloCity Field Service - Ecosystem delivery, API limits, and enterprise branding.

alter table webhook_subscriptions add column if not exists signing_secret text;

create table if not exists webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  subscription_id uuid references webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'delivered', 'retrying', 'failed', 'dead_letter')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  response_status integer,
  error_message text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists api_rate_windows (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  api_key_id uuid references platform_api_keys(id) on delete cascade,
  route text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  limit_count integer not null default 600,
  updated_at timestamptz not null default now(),
  unique(api_key_id, route, window_start)
);

create table if not exists tenant_branding (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) not null unique default app.default_tenant_id(),
  display_name text not null default 'VeloCity',
  primary_color text not null default '#c8f135',
  accent_color text not null default '#f5a623',
  logo_url text,
  custom_domain text unique,
  theme jsonb not null default '{}',
  white_label_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists intelligence_snapshots (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  scope text not null,
  subject_id uuid,
  forecast jsonb not null default '{}',
  risk jsonb not null default '{}',
  recommendations jsonb not null default '[]',
  confidence numeric not null default 0.75,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_due_idx on webhook_deliveries(status, next_retry_at, created_at);
create index if not exists webhook_deliveries_tenant_idx on webhook_deliveries(tenant_id, status, created_at desc);
create index if not exists api_rate_windows_key_idx on api_rate_windows(api_key_id, route, window_start);
create index if not exists intelligence_snapshots_tenant_scope_idx on intelligence_snapshots(tenant_id, scope, created_at desc);

alter table webhook_deliveries enable row level security;
alter table api_rate_windows enable row level security;
alter table tenant_branding enable row level security;
alter table intelligence_snapshots enable row level security;

create policy "Tenant admins read webhook deliveries" on webhook_deliveries
  for select using (app.is_tenant_admin(tenant_id));

create policy "Tenant admins read API rate windows" on api_rate_windows
  for select using (app.is_tenant_admin(tenant_id));

create policy "Tenant admins manage branding" on tenant_branding
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy "Tenant admins read intelligence snapshots" on intelligence_snapshots
  for select using (app.is_tenant_admin(tenant_id));

