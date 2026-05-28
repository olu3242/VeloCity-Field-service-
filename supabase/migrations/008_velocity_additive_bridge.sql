-- Velocity/JIT AI additive bridge for existing multi-tenant marketplace schema.
-- Safe intent: only create missing tables/views/functions/policies. No drops, renames, or destructive type changes.

create schema if not exists app;

create or replace function app.default_tenant_id()
returns uuid language sql immutable as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function app.current_tenant_id()
returns uuid language plpgsql stable security definer as $$
declare
  jwt_tenant uuid;
  profile_tenant uuid;
  remote_user_tenant uuid;
begin
  jwt_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  if jwt_tenant is not null then return jwt_tenant; end if;

  if to_regclass('public.profiles') is not null then
    execute 'select tenant_id from public.profiles where id = $1 limit 1'
      into profile_tenant using auth.uid();
    if profile_tenant is not null then return profile_tenant; end if;
  end if;

  if to_regclass('public.users') is not null then
    execute 'select tenant_id from public.users where auth_uid = $1 limit 1'
      into remote_user_tenant using auth.uid();
    if remote_user_tenant is not null then return remote_user_tenant; end if;
  end if;

  return app.default_tenant_id();
end;
$$;

create or replace function app.is_tenant_admin(target_tenant_id uuid)
returns boolean language plpgsql stable security definer as $$
declare
  is_velocity_admin boolean := false;
  is_remote_admin boolean := false;
begin
  if to_regclass('public.profiles') is not null then
    execute 'select exists(select 1 from public.profiles where id = $1 and role = ''admin'' and tenant_id = $2)'
      into is_velocity_admin using auth.uid(), target_tenant_id;
  end if;
  if is_velocity_admin then return true; end if;

  if to_regclass('public.users') is not null then
    execute 'select exists(select 1 from public.users where auth_uid = $1 and role in (''super_admin'', ''tenant_admin'') and tenant_id = $2)'
      into is_remote_admin using auth.uid(), target_tenant_id;
  end if;

  return coalesce(is_remote_admin, false);
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  role text not null default 'customer',
  full_name text,
  phone text,
  avatar_url text,
  stripe_customer_id text unique,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  name text not null,
  city text not null,
  state text not null,
  zip_codes text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  user_id uuid not null,
  business_name text not null,
  categories text[] not null default '{}',
  service_area_ids uuid[] not null default '{}',
  service_radius_miles integer not null default 25,
  status text not null default 'pending',
  trust_score numeric(5,2) not null default 0,
  completed_jobs integer not null default 0,
  is_online boolean not null default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  customer_id uuid not null,
  provider_id uuid,
  category text not null default 'other',
  title text not null,
  description text not null,
  urgency text not null default 'scheduled',
  status text not null default 'submitted',
  street text,
  unit text,
  city text,
  state text,
  zip text,
  preferred_date date,
  preferred_time_start time,
  preferred_time_end time,
  photo_urls text[] default '{}',
  document_urls text[] default '{}',
  estimated_cost_cents integer,
  quoted_cost_cents integer,
  final_cost_cents integer,
  ai_classification jsonb default '{}',
  ai_match_scores jsonb default '{}',
  internal_notes text,
  customer_notes text,
  provider_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  agent_name text not null,
  job_id uuid,
  user_id uuid,
  action text not null,
  input jsonb default '{}',
  output jsonb default '{}',
  tokens_used integer,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create table if not exists automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  event_type text not null,
  source text not null default 'app',
  entity_type text,
  entity_id uuid,
  actor_id uuid,
  payload jsonb not null default '{}',
  dedup_key text,
  created_at timestamptz not null default now()
);

create table if not exists automation_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
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

create index if not exists profiles_tenant_id_idx on profiles(tenant_id);
create index if not exists service_areas_tenant_id_idx on service_areas(tenant_id);
create index if not exists providers_tenant_id_idx on providers(tenant_id);
create index if not exists jobs_tenant_id_idx on jobs(tenant_id);
create index if not exists agent_logs_tenant_id_idx on agent_logs(tenant_id);
create index if not exists audit_logs_tenant_id_idx on audit_logs(tenant_id);
create index if not exists automation_events_tenant_type_idx on automation_events(tenant_id, event_type, created_at desc);
create index if not exists automation_queue_tenant_status_idx on automation_queue(tenant_id, status, created_at desc);
create unique index if not exists automation_events_dedup_idx on automation_events(dedup_key) where dedup_key is not null;
create unique index if not exists automation_queue_dedup_pending_idx on automation_queue(dedup_key) where dedup_key is not null and status in ('pending', 'processing');

alter table profiles enable row level security;
alter table providers enable row level security;
alter table jobs enable row level security;
alter table agent_logs enable row level security;
alter table audit_logs enable row level security;
alter table automation_events enable row level security;
alter table automation_queue enable row level security;

do $$
begin
  if to_regclass('public.artisans') is not null then
    execute $view$
      create or replace view velocity_providers_view as
      select id, tenant_id, user_id, business_name, category as primary_category, verification_status as status, created_at, updated_at
      from artisans
    $view$;
  end if;

  if to_regclass('public.services') is not null then
    execute $view$
      create or replace view velocity_services_view as
      select id, tenant_id, artisan_id as provider_id, title, description, category, base_price_cents, status, created_at, updated_at
      from services
    $view$;
  end if;

  if to_regclass('public.bookings') is not null then
    execute $view$
      create or replace view velocity_jobs_view as
      select id, tenant_id, client_id as customer_id, artisan_id as provider_id, service_id, status, notes as description, total_amount as final_cost_cents, created_at, updated_at
      from bookings
    $view$;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automation_events' and policyname = 'Tenant admins see automation events') then
    create policy "Tenant admins see automation events" on automation_events for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automation_queue' and policyname = 'Tenant admins see automation queue') then
    create policy "Tenant admins see automation queue" on automation_queue for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_logs' and policyname = 'Admins see agent logs') then
    create policy "Admins see agent logs" on agent_logs for select using (app.is_tenant_admin(tenant_id));
  end if;
end $$;
