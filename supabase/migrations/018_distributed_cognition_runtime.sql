-- VeloCity Field Service - Distributed cognition runtime.

create table if not exists execution_graphs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  plan_id uuid references meta_orchestration_plans(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'running', 'completed', 'failed', 'replaying')),
  graph jsonb not null default '{}',
  replay_of uuid references execution_graphs(id) on delete set null,
  correlation_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists execution_graph_nodes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  graph_id uuid references execution_graphs(id) on delete cascade,
  node_key text not null,
  workflow_type text not null,
  dependencies text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'ready', 'running', 'completed', 'failed', 'skipped')),
  priority integer not null default 50,
  payload jsonb not null default '{}',
  output jsonb not null default '{}',
  run_id uuid references orchestration_runs(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  unique(graph_id, node_key)
);

create table if not exists cognition_telemetry (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  signal_type text not null,
  subject_type text not null,
  subject_id uuid,
  score numeric not null default 0,
  confidence numeric not null default 0.75,
  metadata jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists optimization_loops (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  loop_type text not null,
  target_type text not null,
  target_id uuid,
  status text not null default 'open' check (status in ('open', 'running', 'applied', 'dismissed', 'failed')),
  recommendation text not null,
  expected_impact jsonb not null default '{}',
  actual_impact jsonb not null default '{}',
  correlation_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists federation_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  participant_id uuid references ecosystem_participants(id) on delete set null,
  event_type text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed', 'rejected')),
  payload jsonb not null default '{}',
  governance_decision text not null default 'allow',
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists execution_graphs_tenant_idx on execution_graphs(tenant_id, status, created_at desc);
create index if not exists execution_graph_nodes_graph_idx on execution_graph_nodes(graph_id, status, priority desc);
create index if not exists cognition_telemetry_tenant_idx on cognition_telemetry(tenant_id, signal_type, created_at desc);
create index if not exists optimization_loops_tenant_idx on optimization_loops(tenant_id, status, loop_type, created_at desc);
create index if not exists federation_events_tenant_idx on federation_events(tenant_id, direction, status, created_at desc);

alter table execution_graphs enable row level security;
alter table execution_graph_nodes enable row level security;
alter table cognition_telemetry enable row level security;
alter table optimization_loops enable row level security;
alter table federation_events enable row level security;

create policy "Tenant admins manage execution graphs" on execution_graphs
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read execution graph nodes" on execution_graph_nodes
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read cognition telemetry" on cognition_telemetry
  for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage optimization loops" on optimization_loops
  for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins read federation events" on federation_events
  for select using (app.is_tenant_admin(tenant_id));

