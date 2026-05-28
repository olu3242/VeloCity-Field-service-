-- VeloCity Field Service - Meta-orchestration and cognition runtime.

create table if not exists meta_orchestration_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  objective text not null,
  status text not null default 'planned' check (status in ('planned', 'running', 'completed', 'failed', 'paused')),
  priority integer not null default 50,
  strategy text not null default 'balanced',
  parent_run_id uuid references orchestration_runs(id) on delete set null,
  graph jsonb not null default '{}',
  plan jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orchestration_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  plan_id uuid references meta_orchestration_plans(id) on delete cascade,
  run_id uuid references orchestration_runs(id) on delete cascade,
  checkpoint_type text not null default 'state',
  state jsonb not null default '{}',
  recovery_hint jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists memory_graph_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  from_memory_id uuid references orchestration_memory(id) on delete cascade,
  to_memory_id uuid references orchestration_memory(id) on delete cascade,
  relation text not null,
  weight numeric not null default 0.5,
  metadata jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists cognition_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  subject_type text not null,
  subject_id uuid,
  score_type text not null,
  score numeric not null default 0,
  level text not null default 'medium' check (level in ('low', 'medium', 'high', 'critical')),
  reasons text[] not null default '{}',
  recommendations text[] not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists ecosystem_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  name text not null,
  participant_type text not null,
  endpoint_url text,
  capabilities text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  governance_policy jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_orchestration_plans_tenant_idx on meta_orchestration_plans(tenant_id, status, priority desc, created_at desc);
create index if not exists orchestration_checkpoints_plan_idx on orchestration_checkpoints(plan_id, created_at desc);
create index if not exists memory_graph_edges_tenant_idx on memory_graph_edges(tenant_id, relation, created_at desc);
create index if not exists cognition_scores_tenant_idx on cognition_scores(tenant_id, subject_type, score_type, created_at desc);
create index if not exists ecosystem_participants_tenant_idx on ecosystem_participants(tenant_id, status, participant_type);

alter table meta_orchestration_plans enable row level security;
alter table orchestration_checkpoints enable row level security;
alter table memory_graph_edges enable row level security;
alter table cognition_scores enable row level security;
alter table ecosystem_participants enable row level security;

create policy "Tenant admins manage meta orchestration plans" on meta_orchestration_plans
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read orchestration checkpoints" on orchestration_checkpoints
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read memory graph edges" on memory_graph_edges
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read cognition scores" on cognition_scores
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage ecosystem participants" on ecosystem_participants
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

