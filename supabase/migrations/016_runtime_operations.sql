-- Runtime operations hardening: heartbeats, dead letters, delivery tracking, correlation IDs.

alter table automation_events add column if not exists correlation_id text;
alter table automation_queue add column if not exists correlation_id text;
alter table automation_runs add column if not exists correlation_id text;
alter table automation_runs add column if not exists duration_ms integer;
alter table automation_runs add column if not exists handler text;

create index if not exists automation_events_correlation_idx on automation_events(correlation_id);
create index if not exists automation_queue_correlation_idx on automation_queue(correlation_id);
create index if not exists automation_runs_correlation_idx on automation_runs(correlation_id);

create table if not exists worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null unique,
  worker_type text not null default 'automation',
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_type_status_idx on worker_heartbeats(worker_type, status, last_seen_at desc);

alter table worker_heartbeats enable row level security;

drop policy if exists "Tenant admins see worker heartbeats" on worker_heartbeats;
create policy "Tenant admins see worker heartbeats" on worker_heartbeats
  for select using (app.is_tenant_admin(app.default_tenant_id()));

drop policy if exists "Service role manages worker heartbeats" on worker_heartbeats;
create policy "Service role manages worker heartbeats" on worker_heartbeats
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists automation_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  queue_id uuid,
  event_id uuid,
  event_type text not null,
  correlation_id text,
  payload jsonb not null default '{}'::jsonb,
  error_message text not null,
  retry_count integer not null default 0,
  status text not null default 'open',
  replayed_at timestamptz,
  replayed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists automation_dead_letters_status_idx on automation_dead_letters(status, created_at desc);
create index if not exists automation_dead_letters_tenant_idx on automation_dead_letters(tenant_id, status, created_at desc);
create index if not exists automation_dead_letters_correlation_idx on automation_dead_letters(correlation_id);

alter table automation_dead_letters enable row level security;

drop policy if exists "Tenant admins see automation dead letters" on automation_dead_letters;
create policy "Tenant admins see automation dead letters" on automation_dead_letters
  for select using (app.is_tenant_admin(tenant_id));

drop policy if exists "Service role manages automation dead letters" on automation_dead_letters;
create policy "Service role manages automation dead letters" on automation_dead_letters
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  notification_id uuid,
  user_id uuid,
  channel text not null,
  provider text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  next_retry_at timestamptz,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_status_idx on notification_deliveries(status, next_retry_at);
create index if not exists notification_deliveries_user_idx on notification_deliveries(user_id, created_at desc);
create index if not exists notification_deliveries_correlation_idx on notification_deliveries(correlation_id);

alter table notification_deliveries enable row level security;

drop policy if exists "Users see own notification deliveries" on notification_deliveries;
create policy "Users see own notification deliveries" on notification_deliveries
  for select using (auth.uid() = user_id or app.is_tenant_admin(tenant_id));

drop policy if exists "Service role manages notification deliveries" on notification_deliveries;
create policy "Service role manages notification deliveries" on notification_deliveries
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
