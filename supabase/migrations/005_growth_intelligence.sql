-- VeloCity Field Service - Growth intelligence and franchise readiness

create table if not exists franchise_territories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  name text not null,
  city text not null,
  state text not null,
  zip_codes text[] not null default '{}',
  status text not null default 'evaluating',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists territory_operators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  profile_id uuid references profiles(id),
  name text not null,
  email text,
  status text not null default 'candidate',
  qualifications jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists territory_scorecards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  demand_index integer not null default 0,
  supply_index integer not null default 0,
  provider_count integer not null default 0,
  active_customers integer not null default 0,
  jobs_completed integer not null default 0,
  revenue_cents integer not null default 0,
  dispute_rate numeric(5,4) not null default 0,
  sla_hit_rate numeric(5,4) not null default 0,
  readiness_score integer not null default 0,
  period_start date,
  period_end date,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create table if not exists expansion_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid references franchise_territories(id) on delete cascade,
  recommendation_type text not null,
  score integer not null default 0,
  title text not null,
  body text not null,
  recommended_zip_codes text[] not null default '{}',
  recommended_categories service_category[] not null default '{}',
  payload jsonb default '{}',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists local_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid references franchise_territories(id) on delete cascade,
  city text not null,
  state text not null,
  zip text,
  category service_category,
  demand_level text not null default 'medium',
  provider_supply_level text not null default 'medium',
  median_ticket_cents integer,
  competitor_index integer,
  captured_at timestamptz not null default now(),
  metadata jsonb default '{}'
);

create index if not exists franchise_territories_tenant_idx on franchise_territories(tenant_id);
create index if not exists territory_scorecards_tenant_idx on territory_scorecards(tenant_id);
create index if not exists territory_scorecards_readiness_idx on territory_scorecards(readiness_score desc);
create index if not exists expansion_recommendations_tenant_idx on expansion_recommendations(tenant_id, status);
create index if not exists local_market_snapshots_tenant_idx on local_market_snapshots(tenant_id, city, state);

alter table franchise_territories enable row level security;
alter table territory_operators enable row level security;
alter table territory_scorecards enable row level security;
alter table expansion_recommendations enable row level security;
alter table local_market_snapshots enable row level security;

create policy "Tenant admins manage franchise territories" on franchise_territories for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage territory operators" on territory_operators for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins see territory scorecards" on territory_scorecards for select using (app.is_tenant_admin(tenant_id));
create policy "Tenant admins manage expansion recommendations" on expansion_recommendations for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy "Tenant admins see market snapshots" on local_market_snapshots for select using (app.is_tenant_admin(tenant_id));

create trigger franchise_territories_updated_at before update on franchise_territories
  for each row execute function update_updated_at();
create trigger territory_operators_updated_at before update on territory_operators
  for each row execute function update_updated_at();
create trigger expansion_recommendations_updated_at before update on expansion_recommendations
  for each row execute function update_updated_at();
