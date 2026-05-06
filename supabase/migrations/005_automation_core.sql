-- VeloCity Field Service - Automation core

create table if not exists automation_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  event_type text not null,
  source text not null default 'app',
  entity_type text,
  entity_id uuid,
  actor_id uuid references profiles(id),
  payload jsonb not null default '{}',
  dedup_key text,
  created_at timestamptz not null default now()
);

create table if not exists automation_queue (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  event_id uuid references automation_events(id) on delete cascade,
  event_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  retry_count integer not null default 0,
  dedup_key text,
  error_message text,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  queue_id uuid references automation_queue(id) on delete set null,
  event_id uuid references automation_events(id) on delete set null,
  event_type text not null,
  status text not null,
  actions jsonb not null default '[]',
  output jsonb not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists automation_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) default app.default_tenant_id(),
  event_type text not null,
  name text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table automation_runs add column if not exists queue_id uuid references automation_queue(id) on delete set null;
alter table automation_runs add column if not exists actions jsonb not null default '[]';
alter table automation_runs add column if not exists output jsonb not null default '{}';
alter table automation_runs add column if not exists error_message text;
alter table automation_runs add column if not exists started_at timestamptz not null default now();
alter table automation_runs add column if not exists completed_at timestamptz;
alter table automation_runs add column if not exists event_type text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'automation_runs' and column_name = 'rule_id'
  ) then
    alter table automation_runs alter column rule_id drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'automation_runs' and column_name = 'event_id'
  ) then
    alter table automation_runs alter column event_id drop not null;
  end if;
end $$;
alter table automation_runs alter column event_type set default 'unknown';
update automation_runs set event_type = 'unknown' where event_type is null;
alter table automation_runs alter column event_type set not null;

alter table automation_rules add column if not exists event_type text;
alter table automation_rules add column if not exists enabled boolean not null default true;
alter table automation_rules add column if not exists config jsonb not null default '{}';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'automation_rules' and column_name = 'trigger_event'
  ) then
    update automation_rules set event_type = trigger_event where event_type is null and trigger_event is not null;
  end if;
end $$;

create unique index if not exists automation_events_dedup_idx
  on automation_events(dedup_key) where dedup_key is not null;
create unique index if not exists automation_queue_dedup_pending_idx
  on automation_queue(dedup_key) where dedup_key is not null and status in ('pending', 'processing');
create index if not exists automation_events_tenant_type_idx on automation_events(tenant_id, event_type, created_at desc);
create index if not exists automation_queue_status_idx on automation_queue(status, available_at, created_at);
create index if not exists automation_queue_tenant_status_idx on automation_queue(tenant_id, status, created_at desc);
create index if not exists automation_runs_queue_idx on automation_runs(queue_id);
create index if not exists automation_runs_tenant_status_idx on automation_runs(tenant_id, status, started_at desc);
create index if not exists automation_rules_tenant_event_idx on automation_rules(tenant_id, event_type);

alter table automation_events enable row level security;
alter table automation_queue enable row level security;
alter table automation_runs enable row level security;
alter table automation_rules enable row level security;

create policy "Tenant admins see automation events" on automation_events for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins see automation queue" on automation_queue for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins see automation runs" on automation_runs for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage automation rules" on automation_rules for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Authenticated users emit automation events" on automation_events for insert with check (
  auth.role() = 'authenticated'
  and tenant_id = app.current_tenant_id()
  and (actor_id is null or actor_id = auth.uid())
);
create policy "Authenticated users enqueue automation events" on automation_queue for insert with check (
  auth.role() = 'authenticated' and tenant_id = app.current_tenant_id()
);

create trigger automation_queue_updated_at before update on automation_queue
  for each row execute function update_updated_at();
create trigger automation_rules_updated_at before update on automation_rules
  for each row execute function update_updated_at();
