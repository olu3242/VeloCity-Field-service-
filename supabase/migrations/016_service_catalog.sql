-- Migration 016: Service Catalog Engine. Additive only — no drops, no alters
-- to the existing service_category enum or jobs/providers columns. Extends
-- the real, already-used category layer with a sub-categorization, package,
-- provider-capability, and pricing-profile layer.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. service_types — sub-categories under the existing service_category enum
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists service_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  category service_category not null,
  name text not null,
  slug text not null,
  description text,
  default_duration_minutes integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category, slug)
);

create index if not exists service_types_tenant_id_idx on service_types(tenant_id);
create index if not exists service_types_category_idx on service_types(category);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. service_packages — configurable tiers under a service type
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists service_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  service_type_id uuid not null references service_types(id) on delete cascade,
  tier text not null check (tier in ('basic', 'standard', 'premium', 'emergency', 'commercial')),
  name text not null,
  description text,
  price_cents integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type_id, tier)
);

create index if not exists service_packages_tenant_id_idx on service_packages(tenant_id);
create index if not exists service_packages_service_type_id_idx on service_packages(service_type_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. provider_service_capabilities — provider eligibility for a service type
--    Extends, does not replace, providers.categories[] (category-level array
--    membership remains the fallback eligibility check when no capability
--    rows exist for a provider).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_service_capabilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null references providers(id) on delete cascade,
  service_type_id uuid not null references service_types(id) on delete cascade,
  skill_level text not null default 'qualified' check (skill_level in ('trainee', 'qualified', 'expert')),
  is_certified boolean not null default false,
  certification_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, service_type_id)
);

create index if not exists provider_service_capabilities_tenant_id_idx on provider_service_capabilities(tenant_id);
create index if not exists provider_service_capabilities_provider_id_idx on provider_service_capabilities(provider_id);
create index if not exists provider_service_capabilities_service_type_id_idx on provider_service_capabilities(service_type_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. service_pricing_profiles — data-driven pricing inputs per category/
--    package, consulted by calculatePrice.ts as an override of the existing
--    hardcoded CATEGORY_BASE_PRICE_CENTS table (which remains the fallback
--    when no profile row exists for a given category/tier).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists service_pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  category service_category not null,
  tier text not null check (tier in ('basic', 'standard', 'premium', 'emergency', 'commercial')),
  base_price_cents integer not null,
  labor_rate_cents integer not null default 0,
  travel_fee_cents integer not null default 0,
  urgency_multiplier numeric(4,2) not null default 1.0,
  commercial_multiplier numeric(4,2) not null default 1.0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category, tier)
);

create index if not exists service_pricing_profiles_tenant_id_idx on service_pricing_profiles(tenant_id);
create index if not exists service_pricing_profiles_category_idx on service_pricing_profiles(category);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. jobs gets two nullable, additive FKs into the new catalog layer. The
--    existing jobs.category enum column is untouched and remains required;
--    these are optional refinements on top of it, so every existing booking
--    and every booking flow that doesn't select a service type/package
--    keeps working unchanged.
-- ─────────────────────────────────────────────────────────────────────────
alter table jobs add column if not exists service_type_id uuid references service_types(id);
alter table jobs add column if not exists service_package_id uuid references service_packages(id);

create index if not exists jobs_service_type_id_idx on jobs(service_type_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — same tenant-isolation + admin-write pattern as the rest of the schema
-- ─────────────────────────────────────────────────────────────────────────
alter table service_types enable row level security;
alter table service_packages enable row level security;
alter table provider_service_capabilities enable row level security;
alter table service_pricing_profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_types' and policyname = 'Anyone can view active service types') then
    create policy "Anyone can view active service types" on service_types for select using (is_active = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_types' and policyname = 'Admins manage service types') then
    create policy "Admins manage service types" on service_types for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_packages' and policyname = 'Anyone can view active service packages') then
    create policy "Anyone can view active service packages" on service_packages for select using (is_active = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_packages' and policyname = 'Admins manage service packages') then
    create policy "Admins manage service packages" on service_packages for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_service_capabilities' and policyname = 'Providers view own capabilities') then
    create policy "Providers view own capabilities" on provider_service_capabilities for select using (
      provider_id in (select id from providers where user_id = auth.uid())
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_service_capabilities' and policyname = 'Admins manage provider capabilities') then
    create policy "Admins manage provider capabilities" on provider_service_capabilities for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_pricing_profiles' and policyname = 'Admins manage pricing profiles') then
    create policy "Admins manage pricing profiles" on service_pricing_profiles for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed: Home Services category subset (Plumbing, Electrical, HVAC, Cleaning,
-- Landscaping, Handyman, Appliance Repair) with representative service types
-- and the 5 directive-required package tiers. Roofing has no "General
-- Contractor" enum value in service_category, so it is mapped to the
-- closest existing real category (roofing) rather than inventing a new enum
-- value in an additive migration.
-- ─────────────────────────────────────────────────────────────────────────
insert into service_types (tenant_id, category, name, slug, description, default_duration_minutes)
select app.default_tenant_id(), category, name, slug, description, duration
from (values
  ('plumbing'::service_category, 'Leak Repair', 'leak-repair', 'Fixing leaking pipes, fixtures, and fittings.', 90),
  ('plumbing'::service_category, 'Drain Cleaning', 'drain-cleaning', 'Clearing clogged drains and sewer lines.', 60),
  ('plumbing'::service_category, 'Water Heater Service', 'water-heater-service', 'Repair, replacement, and maintenance of water heaters.', 120),
  ('electrical'::service_category, 'Wiring Repair', 'wiring-repair', 'Diagnosing and repairing faulty wiring.', 90),
  ('electrical'::service_category, 'Panel Upgrade', 'panel-upgrade', 'Electrical panel replacement and capacity upgrades.', 180),
  ('electrical'::service_category, 'Fixture Installation', 'fixture-installation', 'Installing lighting and electrical fixtures.', 60),
  ('hvac'::service_category, 'AC Repair', 'ac-repair', 'Diagnosing and repairing air conditioning systems.', 90),
  ('hvac'::service_category, 'Furnace Repair', 'furnace-repair', 'Diagnosing and repairing heating systems.', 90),
  ('hvac'::service_category, 'System Maintenance', 'system-maintenance', 'Seasonal HVAC tune-ups and inspections.', 60),
  ('cleaning'::service_category, 'Standard Home Cleaning', 'standard-home-cleaning', 'Routine residential cleaning service.', 120),
  ('cleaning'::service_category, 'Deep Cleaning', 'deep-cleaning', 'Intensive whole-home cleaning service.', 240),
  ('landscaping'::service_category, 'Lawn Maintenance', 'lawn-maintenance', 'Mowing, edging, and routine lawn care.', 60),
  ('landscaping'::service_category, 'Landscape Design', 'landscape-design', 'Planning and installing landscape features.', 180),
  ('handyman'::service_category, 'General Repairs', 'general-repairs', 'Miscellaneous home repair tasks.', 90),
  ('handyman'::service_category, 'Furniture Assembly', 'furniture-assembly', 'Assembling furniture and fixtures.', 60),
  ('appliance_repair'::service_category, 'Refrigerator Repair', 'refrigerator-repair', 'Diagnosing and repairing refrigerators.', 90),
  ('appliance_repair'::service_category, 'Washer/Dryer Repair', 'washer-dryer-repair', 'Diagnosing and repairing washers and dryers.', 90)
) as seed(category, name, slug, description, duration)
on conflict (tenant_id, category, slug) do nothing;

insert into service_packages (tenant_id, service_type_id, tier, name, description)
select app.default_tenant_id(), st.id, tier.tier, tier.name, tier.description
from service_types st
cross join (values
  ('basic', 'Basic', 'Standard scope, standard scheduling.'),
  ('standard', 'Standard', 'Full diagnostic and repair scope.'),
  ('premium', 'Premium', 'Priority scheduling with extended warranty.'),
  ('emergency', 'Emergency', 'Same-day dispatch for urgent issues.'),
  ('commercial', 'Commercial', 'Scoped for commercial properties and accounts.')
) as tier(tier, name, description)
where st.tenant_id = app.default_tenant_id()
on conflict (service_type_id, tier) do nothing;
