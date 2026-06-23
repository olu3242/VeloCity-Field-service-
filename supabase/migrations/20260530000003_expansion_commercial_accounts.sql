-- Migration: Expansion Intelligence + Commercial Accounts domain model (Batch X+3).
-- Additive only. Per EXPANSION_AUDIT.md: `franchise_territories` (migration
-- 004) is already the live "market region" concept — this migration does
-- NOT introduce a parallel market_regions table. Instead market_metrics/
-- market_supply/market_demand/market_opportunities all key off
-- franchise_territories(id), activating that table's dead
-- demand_index/supply_index columns with real computed history instead of
-- duplicating the region primitive.
--
-- `src/lib/enterprise-contracts/` (contract-registry.ts, sla-contract-
-- monitor.ts, governance-enforcer.ts) is confirmed dead, unwired,
-- in-memory-only code with zero importers anywhere in src/ — it is
-- superseded by the persisted commercial_* tables below (whose shapes are
-- modeled on its EnterpriseContract/SLAContractBreachEvent/
-- ContractGovernanceCheck types), not extended in place, since nothing
-- references it to extend.
--
-- `customer_addresses` (migration 001) already supports multiple labeled
-- locations per customer; commercial_locations mirrors that column shape
-- under commercial_account_id rather than reinventing address modeling.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. market_metrics — periodic demand/supply/opportunity snapshot per
--    franchise_territories row (the existing region concept).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists market_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  metric_date date not null default current_date,
  demand_index numeric not null default 0,
  supply_index numeric not null default 0,
  opportunity_score numeric not null default 0,
  computed_at timestamptz not null default now(),
  unique (territory_id, metric_date)
);

create index if not exists market_metrics_tenant_id_idx on market_metrics(tenant_id);
create index if not exists market_metrics_territory_id_idx on market_metrics(territory_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. market_supply — per-category provider supply within a territory.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists market_supply (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  category service_category not null,
  active_providers integer not null default 0,
  avg_response_minutes numeric,
  capacity_utilization numeric,
  computed_at timestamptz not null default now(),
  unique (territory_id, category, computed_at)
);

create index if not exists market_supply_territory_id_idx on market_supply(territory_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. market_demand — per-category job demand within a territory.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists market_demand (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  category service_category not null,
  expected_jobs integer not null default 0,
  actual_jobs integer not null default 0,
  demand_growth_rate numeric,
  computed_at timestamptz not null default now(),
  unique (territory_id, category, computed_at)
);

create index if not exists market_demand_territory_id_idx on market_demand(territory_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. market_opportunities — NOVA-surfaced expansion opportunities, derived
--    from market_metrics/market_supply/market_demand, never hand-entered.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists market_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  territory_id uuid not null references franchise_territories(id) on delete cascade,
  category service_category,
  opportunity_type text not null check (opportunity_type in ('new_territory', 'category_expansion', 'provider_recruitment', 'commercial_account')),
  expected_revenue_impact_cents integer not null default 0,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed', 'dismissed')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_opportunities_territory_id_idx on market_opportunities(territory_id);
create index if not exists market_opportunities_status_idx on market_opportunities(status) where status = 'open';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. commercial_accounts — top-level commercial customer account. A
--    commercial account is the multi-location, multi-contact, contracted
--    counterpart to an individual customer profile; it does not replace
--    `profiles`, it groups one or more existing profiles as contacts.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists commercial_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  name text not null,
  account_type text not null default 'commercial' check (account_type in ('commercial', 'franchise_partner', 'property_management')),
  primary_contact_id uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'at_risk', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_accounts_tenant_id_idx on commercial_accounts(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. commercial_locations — multi-location service addresses per account,
--    mirroring customer_addresses' column shape.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists commercial_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  account_id uuid not null references commercial_accounts(id) on delete cascade,
  label text not null default 'Primary',
  street text not null,
  unit text,
  city text not null,
  state text not null,
  zip text not null,
  country text not null default 'US',
  location point,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists commercial_locations_account_id_idx on commercial_locations(account_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. commercial_contracts — SLA/volume/custom-terms contracts, modeled on
--    the dead EnterpriseContract type from src/lib/enterprise-contracts/
--    contract-registry.ts (superseded, not imported, since it has zero
--    callers).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists commercial_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  account_id uuid not null references commercial_accounts(id) on delete cascade,
  contract_type text not null check (contract_type in ('sla', 'volume_commitment', 'custom_terms', 'franchise')),
  billing_frequency text not null default 'monthly' check (billing_frequency in ('monthly', 'quarterly', 'annual')),
  contract_value_cents integer not null default 0,
  sla_response_minutes integer,
  volume_commitment_jobs_per_period integer,
  status text not null default 'draft' check (status in ('draft', 'active', 'at_risk', 'expired', 'terminated')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_contracts_account_id_idx on commercial_contracts(account_id);
create index if not exists commercial_contracts_status_idx on commercial_contracts(status) where status in ('active', 'at_risk');

-- ─────────────────────────────────────────────────────────────────────────
-- 8. commercial_service_plans — entitlements per contract, derived from the
--    same Service Catalog as membership_entitlements (Batch X+2). No
--    hardcoded benefits.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists commercial_service_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  contract_id uuid not null references commercial_contracts(id) on delete cascade,
  service_type_id uuid not null references service_types(id) on delete cascade,
  service_package_id uuid references service_packages(id) on delete set null,
  included_uses_per_period integer,
  period text not null default 'monthly' check (period in ('monthly', 'quarterly', 'annual', 'contract_term')),
  created_at timestamptz not null default now(),
  unique (contract_id, service_type_id)
);

create index if not exists commercial_service_plans_contract_id_idx on commercial_service_plans(contract_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. commercial_contacts — named contacts per account, optionally linked to
--    an existing profile.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists commercial_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  account_id uuid not null references commercial_accounts(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role_title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists commercial_contacts_account_id_idx on commercial_contacts(account_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Traceability columns — Customer/Account → Contract → Service Plan →
--     Booking → Revenue Record, mirroring the membership traceability
--     chain from Batch X+2.
-- ─────────────────────────────────────────────────────────────────────────
alter table jobs add column if not exists commercial_account_id uuid references commercial_accounts(id) on delete set null;
alter table jobs add column if not exists commercial_contract_id uuid references commercial_contracts(id) on delete set null;
alter table revenue_records add column if not exists commercial_account_id uuid references commercial_accounts(id) on delete set null;

create index if not exists jobs_commercial_account_id_idx on jobs(commercial_account_id) where commercial_account_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────
alter table market_metrics enable row level security;
alter table market_supply enable row level security;
alter table market_demand enable row level security;
alter table market_opportunities enable row level security;
alter table commercial_accounts enable row level security;
alter table commercial_locations enable row level security;
alter table commercial_contracts enable row level security;
alter table commercial_service_plans enable row level security;
alter table commercial_contacts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'market_metrics' and policyname = 'Admins manage market metrics') then
    create policy "Admins manage market metrics" on market_metrics for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'market_supply' and policyname = 'Admins manage market supply') then
    create policy "Admins manage market supply" on market_supply for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'market_demand' and policyname = 'Admins manage market demand') then
    create policy "Admins manage market demand" on market_demand for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'market_opportunities' and policyname = 'Admins manage market opportunities') then
    create policy "Admins manage market opportunities" on market_opportunities for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_accounts' and policyname = 'Admins manage commercial accounts') then
    create policy "Admins manage commercial accounts" on commercial_accounts for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_accounts' and policyname = 'Primary contact views own commercial account') then
    create policy "Primary contact views own commercial account" on commercial_accounts for select using (primary_contact_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_locations' and policyname = 'Admins manage commercial locations') then
    create policy "Admins manage commercial locations" on commercial_locations for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_locations' and policyname = 'Account contacts view own commercial locations') then
    create policy "Account contacts view own commercial locations" on commercial_locations for select using (
      exists (select 1 from commercial_accounts ca where ca.id = commercial_locations.account_id and ca.primary_contact_id = auth.uid())
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_contracts' and policyname = 'Admins manage commercial contracts') then
    create policy "Admins manage commercial contracts" on commercial_contracts for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_contracts' and policyname = 'Account contacts view own commercial contracts') then
    create policy "Account contacts view own commercial contracts" on commercial_contracts for select using (
      exists (select 1 from commercial_accounts ca where ca.id = commercial_contracts.account_id and ca.primary_contact_id = auth.uid())
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_service_plans' and policyname = 'Admins manage commercial service plans') then
    create policy "Admins manage commercial service plans" on commercial_service_plans for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_service_plans' and policyname = 'Account contacts view own commercial service plans') then
    create policy "Account contacts view own commercial service plans" on commercial_service_plans for select using (
      exists (
        select 1 from commercial_contracts cc
        join commercial_accounts ca on ca.id = cc.account_id
        where cc.id = commercial_service_plans.contract_id and ca.primary_contact_id = auth.uid()
      )
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_contacts' and policyname = 'Admins manage commercial contacts') then
    create policy "Admins manage commercial contacts" on commercial_contacts for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'commercial_contacts' and policyname = 'Account contacts view own commercial contacts') then
    create policy "Account contacts view own commercial contacts" on commercial_contacts for select using (
      exists (select 1 from commercial_accounts ca where ca.id = commercial_contacts.account_id and ca.primary_contact_id = auth.uid())
    );
  end if;
end $$;
