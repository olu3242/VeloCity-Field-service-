-- VeloCity Field Service - AI orchestration and intelligence fabric.

create table if not exists orchestration_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  workflow_type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'partial')),
  priority integer not null default 50,
  source text not null default 'api',
  correlation_id text,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists orchestration_tasks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  run_id uuid references orchestration_runs(id) on delete cascade,
  agent_name text not null,
  capability text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  priority integer not null default 50,
  attempt_count integer not null default 0,
  max_attempts integer not null default 2,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error_message text,
  latency_ms integer not null default 0,
  confidence numeric not null default 0,
  correlation_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists orchestration_memory (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  scope text not null check (scope in ('tenant', 'provider', 'workflow', 'dispatch', 'crm', 'predictive')),
  subject_id uuid,
  workflow_id uuid,
  context_key text not null,
  value jsonb not null default '{}',
  confidence numeric not null default 0.75,
  correlation_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists autonomous_recommendations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  source text not null,
  category text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  recommendation text not null,
  confidence numeric not null default 0.75,
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'applied')),
  correlation_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists event_intelligence_scores (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  event_type text not null,
  score numeric not null default 0,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  reason text,
  frequency integer not null default 0,
  expected_frequency integer not null default 25,
  payload_size integer not null default 0,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists orchestration_runs_tenant_idx on orchestration_runs(tenant_id, status, started_at desc);
create index if not exists orchestration_tasks_run_idx on orchestration_tasks(run_id, status, created_at);
create index if not exists orchestration_memory_lookup_idx on orchestration_memory(tenant_id, scope, subject_id, context_key);
create index if not exists autonomous_recommendations_tenant_idx on autonomous_recommendations(tenant_id, status, severity, created_at desc);
create index if not exists event_intelligence_scores_tenant_idx on event_intelligence_scores(tenant_id, event_type, created_at desc);

alter table orchestration_runs enable row level security;
alter table orchestration_tasks enable row level security;
alter table orchestration_memory enable row level security;
alter table autonomous_recommendations enable row level security;
alter table event_intelligence_scores enable row level security;

create policy "Tenant admins read orchestration runs" on orchestration_runs
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read orchestration tasks" on orchestration_tasks
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage orchestration memory" on orchestration_memory
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage autonomous recommendations" on autonomous_recommendations
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read event intelligence" on event_intelligence_scores
  for select using (app.is_tenant_admin(tenant_id));

