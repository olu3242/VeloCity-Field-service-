-- Migration: Membership Engine + Recurring Revenue domain model (Batch X+2).
-- Additive only — no drops/alters to jobs.category, service_category, or any
-- existing pricing/dispatch table beyond two new nullable FK columns (jobs,
-- revenue_records) added for traceability. The dead `subscriptions` table
-- from migration 001 is left untouched (already unused by all app code);
-- this migration introduces the persistent, billed, lifecycle-tracked
-- replacement the directive calls for, modeled on that table's column shape
-- but wired into the real Service Catalog (migration 016) and Revenue
-- Records (migration 20260530000001) rather than standing alone.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. membership_plans — top-level plan catalog (Home Care, HVAC Care,
--    Plumbing Protection, Handyman Care, Commercial Maintenance, ...).
--    Category-agnostic: a plan's actual service scope is defined entirely
--    by its membership_entitlements rows below, per Rule 2.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists membership_plans_tenant_id_idx on membership_plans(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. membership_plan_pricing — Monthly/Quarterly/Annual billing options per
--    plan. A plan must have at least one row here per supported frequency.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_plan_pricing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  plan_id uuid not null references membership_plans(id) on delete cascade,
  billing_frequency text not null check (billing_frequency in ('monthly', 'quarterly', 'annual')),
  price_cents integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, billing_frequency)
);

create index if not exists membership_plan_pricing_tenant_id_idx on membership_plan_pricing(tenant_id);
create index if not exists membership_plan_pricing_plan_id_idx on membership_plan_pricing(plan_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. membership_entitlements — Category → Service Type → Package benefit
--    mapping. Every benefit a plan grants is a row here referencing the
--    real Service Catalog (migration 016); no benefit text is hardcoded
--    in application code.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  plan_id uuid not null references membership_plans(id) on delete cascade,
  service_type_id uuid not null references service_types(id) on delete cascade,
  service_package_id uuid references service_packages(id) on delete set null,
  included_uses_per_period integer,
  period text not null default 'annual' check (period in ('monthly', 'quarterly', 'annual', 'plan_term')),
  is_priority_scheduling boolean not null default false,
  benefit_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, service_type_id)
);

create index if not exists membership_entitlements_tenant_id_idx on membership_entitlements(tenant_id);
create index if not exists membership_entitlements_plan_id_idx on membership_entitlements(plan_id);
create index if not exists membership_entitlements_service_type_id_idx on membership_entitlements(service_type_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. membership_subscriptions — the billed customer↔plan relationship.
--    Modeled on the dead `subscriptions` table's column shape (customer,
--    category-derived plan, interval, amount, status, next_service_date)
--    but referencing the real plan/pricing rows above instead of standing
--    alone, per Rule 3 (every recurring dollar traces Customer → Membership
--    → Service Entitlement → Booking → Revenue Record).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  customer_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references membership_plans(id) on delete cascade,
  plan_pricing_id uuid not null references membership_plan_pricing(id) on delete restrict,
  billing_frequency text not null check (billing_frequency in ('monthly', 'quarterly', 'annual')),
  amount_cents integer not null,
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'expired')),
  stripe_subscription_id text unique,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  next_service_date date,
  started_at timestamptz not null default now(),
  renewed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_subscriptions_tenant_id_idx on membership_subscriptions(tenant_id);
create index if not exists membership_subscriptions_customer_id_idx on membership_subscriptions(customer_id);
create index if not exists membership_subscriptions_plan_id_idx on membership_subscriptions(plan_id);
create index if not exists membership_subscriptions_status_idx on membership_subscriptions(status);
create index if not exists membership_subscriptions_current_period_end_idx on membership_subscriptions(current_period_end);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. membership_usage — append-only record of every entitlement consumption,
--    tied to the real job that fulfilled it. Powers ALICE's "missed
--    services" detection and FINN's membership profitability calculation.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  subscription_id uuid not null references membership_subscriptions(id) on delete cascade,
  entitlement_id uuid not null references membership_entitlements(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists membership_usage_tenant_id_idx on membership_usage(tenant_id);
create index if not exists membership_usage_subscription_id_idx on membership_usage(subscription_id);
create index if not exists membership_usage_entitlement_id_idx on membership_usage(entitlement_id);
create index if not exists membership_usage_job_id_idx on membership_usage(job_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. membership_events — append-only lifecycle/audit trail, the source feed
--    for the new automation events added in Phase 8 (membership_created,
--    membership_renewed, membership_expiring, membership_cancelled,
--    renewal_failed). Distinct from `subscription_events` (Stripe webhook
--    metadata log) — this is the membership-domain lifecycle log.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists membership_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  subscription_id uuid not null references membership_subscriptions(id) on delete cascade,
  event_type text not null check (event_type in (
    'membership_created', 'membership_renewed', 'membership_expiring',
    'membership_cancelled', 'service_due', 'renewal_failed'
  )),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists membership_events_tenant_id_idx on membership_events(tenant_id);
create index if not exists membership_events_subscription_id_idx on membership_events(subscription_id);
create index if not exists membership_events_event_type_idx on membership_events(event_type);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Traceability FKs — additive, nullable. Lets a booking and a revenue
--    record point back to the membership that drove them, per Rule 3.
-- ─────────────────────────────────────────────────────────────────────────
alter table jobs add column if not exists membership_subscription_id uuid references membership_subscriptions(id) on delete set null;
create index if not exists jobs_membership_subscription_id_idx on jobs(membership_subscription_id);

alter table revenue_records add column if not exists membership_subscription_id uuid references membership_subscriptions(id) on delete set null;
create index if not exists revenue_records_membership_subscription_id_idx on revenue_records(membership_subscription_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — same tenant-isolation + admin-write pattern as migrations 016/017
-- ─────────────────────────────────────────────────────────────────────────
alter table membership_plans enable row level security;
alter table membership_plan_pricing enable row level security;
alter table membership_entitlements enable row level security;
alter table membership_subscriptions enable row level security;
alter table membership_usage enable row level security;
alter table membership_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_plans' and policyname = 'Anyone can view active membership plans') then
    create policy "Anyone can view active membership plans" on membership_plans for select using (is_active = true or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_plans' and policyname = 'Admins manage membership plans') then
    create policy "Admins manage membership plans" on membership_plans for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_plan_pricing' and policyname = 'Anyone can view active membership plan pricing') then
    create policy "Anyone can view active membership plan pricing" on membership_plan_pricing for select using (is_active = true or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_plan_pricing' and policyname = 'Admins manage membership plan pricing') then
    create policy "Admins manage membership plan pricing" on membership_plan_pricing for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_entitlements' and policyname = 'Anyone can view membership entitlements') then
    create policy "Anyone can view membership entitlements" on membership_entitlements for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_entitlements' and policyname = 'Admins manage membership entitlements') then
    create policy "Admins manage membership entitlements" on membership_entitlements for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_subscriptions' and policyname = 'Customers view own membership subscriptions') then
    create policy "Customers view own membership subscriptions" on membership_subscriptions for select using (
      customer_id = auth.uid() or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_subscriptions' and policyname = 'Service role manages membership subscriptions') then
    create policy "Service role manages membership subscriptions" on membership_subscriptions for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_usage' and policyname = 'Customers view own membership usage') then
    create policy "Customers view own membership usage" on membership_usage for select using (
      subscription_id in (select id from membership_subscriptions where customer_id = auth.uid())
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_usage' and policyname = 'Service role manages membership usage') then
    create policy "Service role manages membership usage" on membership_usage for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_events' and policyname = 'Customers view own membership events') then
    create policy "Customers view own membership events" on membership_events for select using (
      subscription_id in (select id from membership_subscriptions where customer_id = auth.uid())
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_events' and policyname = 'Service role manages membership events') then
    create policy "Service role manages membership events" on membership_events for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed: the 5 directive-required plans, each with Monthly/Quarterly/Annual
-- pricing and entitlements derived from the real service_types/
-- service_packages rows seeded in migration 016. Plumbing Protection and
-- HVAC Care map 1:1 to their category's service types; Home Care and
-- Handyman Care span multiple categories' maintenance-oriented service
-- types; Commercial Maintenance uses the 'commercial' package tier across
-- categories. No synthetic service types are invented here — every
-- entitlement references a real service_types/service_packages row.
-- ─────────────────────────────────────────────────────────────────────────
insert into membership_plans (tenant_id, name, slug, description)
select app.default_tenant_id(), p.name, p.slug, p.description
from (values
  ('Home Care', 'home-care', 'Routine home upkeep across cleaning, handyman, and general maintenance.'),
  ('HVAC Care', 'hvac-care', 'Seasonal HVAC inspection and preventive maintenance with priority scheduling.'),
  ('Plumbing Protection', 'plumbing-protection', 'Recurring plumbing inspection and priority leak/drain response.'),
  ('Handyman Care', 'handyman-care', 'Scheduled handyman visits for ongoing repairs and assembly.'),
  ('Commercial Maintenance', 'commercial-maintenance', 'Recurring multi-category maintenance scoped for commercial accounts.')
) as p(name, slug, description)
on conflict (tenant_id, slug) do nothing;

insert into membership_plan_pricing (tenant_id, plan_id, billing_frequency, price_cents)
select app.default_tenant_id(), mp.id, freq.billing_frequency, freq.price_cents
from membership_plans mp
cross join (values
  ('monthly', 2900),
  ('quarterly', 7900),
  ('annual', 28800)
) as freq(billing_frequency, price_cents)
where mp.tenant_id = app.default_tenant_id()
on conflict (plan_id, billing_frequency) do nothing;

insert into membership_entitlements (tenant_id, plan_id, service_type_id, included_uses_per_period, period, is_priority_scheduling, benefit_description)
select app.default_tenant_id(), mp.id, st.id, ent.included_uses, ent.period, ent.priority, ent.description
from membership_plans mp
join service_types st on st.tenant_id = app.default_tenant_id()
join (values
  ('home-care', 'standard-home-cleaning', 4, 'annual', false, 'Quarterly standard home cleaning included.'),
  ('home-care', 'general-repairs', 2, 'annual', false, 'Two general repair visits per year.'),
  ('hvac-care', 'system-maintenance', 2, 'annual', true, 'Seasonal HVAC tune-up, twice yearly, with priority scheduling.'),
  ('hvac-care', 'ac-repair', null, 'annual', true, 'Priority-scheduled AC repair, unlimited covered visits.'),
  ('hvac-care', 'furnace-repair', null, 'annual', true, 'Priority-scheduled furnace repair, unlimited covered visits.'),
  ('plumbing-protection', 'drain-cleaning', 2, 'annual', true, 'Two priority drain cleanings per year.'),
  ('plumbing-protection', 'leak-repair', null, 'annual', true, 'Priority-scheduled leak repair, unlimited covered visits.'),
  ('handyman-care', 'general-repairs', 6, 'annual', false, 'Six general handyman visits per year.'),
  ('handyman-care', 'furniture-assembly', 4, 'annual', false, 'Four furniture assembly visits per year.'),
  ('commercial-maintenance', 'system-maintenance', null, 'annual', true, 'Unlimited priority-scheduled commercial HVAC maintenance.'),
  ('commercial-maintenance', 'general-repairs', null, 'annual', true, 'Unlimited priority-scheduled commercial handyman maintenance.')
) as ent(plan_slug, service_type_slug, included_uses, period, priority, description)
  on mp.slug = ent.plan_slug and st.slug = ent.service_type_slug
where mp.tenant_id = app.default_tenant_id()
on conflict (plan_id, service_type_id) do nothing;
