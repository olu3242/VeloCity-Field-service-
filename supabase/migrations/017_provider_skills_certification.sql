-- Migration 017: Provider Skills Graph + Certification Intelligence.
-- Additive only — no drops/alters to providers, service_types, or
-- provider_service_capabilities. Extends the existing capability layer
-- (migration 016) with computed, evidence-backed proficiency and
-- certification tiers. Every row here is written by computation code that
-- reads real jobs/reviews/provider_offers data — never manually assigned.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. provider_skills — computed proficiency per provider × service type.
--    Distinct from provider_service_capabilities.skill_level, which is a
--    provider-asserted starting signal; this is the evidence-derived score.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null references providers(id) on delete cascade,
  service_type_id uuid not null references service_types(id) on delete cascade,
  proficiency_score numeric(5,2) not null default 0,
  skill_tier text not null default 'novice' check (skill_tier in ('novice', 'competent', 'proficient', 'expert')),
  completed_jobs_count integer not null default 0,
  average_rating numeric(3,2),
  cancellation_rate numeric(4,3) not null default 0,
  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, service_type_id)
);

create index if not exists provider_skills_tenant_id_idx on provider_skills(tenant_id);
create index if not exists provider_skills_provider_id_idx on provider_skills(provider_id);
create index if not exists provider_skills_service_type_id_idx on provider_skills(service_type_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. provider_skill_evidence — append-only evidence trail behind every
--    proficiency computation (one row per completed job / review / offer
--    outcome that fed the score). Makes every score independently auditable.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_skill_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_skill_id uuid not null references provider_skills(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('completed_job', 'review', 'offer_outcome', 'capability_self_report')),
  source_id uuid,
  detail jsonb not null default '{}',
  recorded_at timestamptz not null default now()
);

create index if not exists provider_skill_evidence_tenant_id_idx on provider_skill_evidence(tenant_id);
create index if not exists provider_skill_evidence_provider_skill_id_idx on provider_skill_evidence(provider_skill_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. provider_skill_progress — gap-to-next-tier tracking, recomputed
--    alongside provider_skills. Powers LENA's learning-path recommendations.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_skill_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null references providers(id) on delete cascade,
  service_type_id uuid not null references service_types(id) on delete cascade,
  current_tier text not null,
  next_tier text,
  jobs_completed integer not null default 0,
  jobs_required_for_next integer,
  rating_required_for_next numeric(3,2),
  gap_summary text,
  computed_at timestamptz not null default now(),
  unique (provider_id, service_type_id)
);

create index if not exists provider_skill_progress_tenant_id_idx on provider_skill_progress(tenant_id);
create index if not exists provider_skill_progress_provider_id_idx on provider_skill_progress(provider_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. provider_certification_requirements — admin-configured thresholds per
--    category × tier. Certifications are computed against these, never
--    manually assigned, per Rule 2.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_certification_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  category service_category not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'elite')),
  min_completed_jobs integer not null default 0,
  min_average_rating numeric(3,2) not null default 0,
  min_trust_score numeric(3,2) not null default 0,
  max_cancellation_rate numeric(4,3) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category, tier)
);

create index if not exists provider_certification_requirements_tenant_id_idx on provider_certification_requirements(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. provider_certifications — the awarded tier per provider × category,
--    computed by evaluateCertifications.ts against the requirements above.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null references providers(id) on delete cascade,
  category service_category not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'elite')),
  is_active boolean not null default true,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, category)
);

create index if not exists provider_certifications_tenant_id_idx on provider_certifications(tenant_id);
create index if not exists provider_certifications_provider_id_idx on provider_certifications(provider_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. provider_certification_evidence — append-only evidence trail behind
--    every certification award/revocation.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists provider_certification_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_certification_id uuid not null references provider_certifications(id) on delete cascade,
  metric text not null,
  value numeric,
  threshold numeric,
  passed boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists provider_certification_evidence_tenant_id_idx on provider_certification_evidence(tenant_id);
create index if not exists provider_certification_evidence_cert_id_idx on provider_certification_evidence(provider_certification_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — same tenant-isolation + admin-write pattern as migration 016
-- ─────────────────────────────────────────────────────────────────────────
alter table provider_skills enable row level security;
alter table provider_skill_evidence enable row level security;
alter table provider_skill_progress enable row level security;
alter table provider_certification_requirements enable row level security;
alter table provider_certifications enable row level security;
alter table provider_certification_evidence enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skills' and policyname = 'Providers view own skills') then
    create policy "Providers view own skills" on provider_skills for select using (
      provider_id in (select id from providers where user_id = auth.uid())
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skills' and policyname = 'Service role manages skills') then
    create policy "Service role manages skills" on provider_skills for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skill_evidence' and policyname = 'Providers view own skill evidence') then
    create policy "Providers view own skill evidence" on provider_skill_evidence for select using (
      provider_skill_id in (select id from provider_skills where provider_id in (select id from providers where user_id = auth.uid()))
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skill_evidence' and policyname = 'Service role manages skill evidence') then
    create policy "Service role manages skill evidence" on provider_skill_evidence for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skill_progress' and policyname = 'Providers view own skill progress') then
    create policy "Providers view own skill progress" on provider_skill_progress for select using (
      provider_id in (select id from providers where user_id = auth.uid())
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_skill_progress' and policyname = 'Service role manages skill progress') then
    create policy "Service role manages skill progress" on provider_skill_progress for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certification_requirements' and policyname = 'Anyone can view certification requirements') then
    create policy "Anyone can view certification requirements" on provider_certification_requirements for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certification_requirements' and policyname = 'Admins manage certification requirements') then
    create policy "Admins manage certification requirements" on provider_certification_requirements for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certifications' and policyname = 'Anyone can view active certifications') then
    create policy "Anyone can view active certifications" on provider_certifications for select using (is_active = true or app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certifications' and policyname = 'Service role manages certifications') then
    create policy "Service role manages certifications" on provider_certifications for all using (app.is_tenant_admin(tenant_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certification_evidence' and policyname = 'Providers view own certification evidence') then
    create policy "Providers view own certification evidence" on provider_certification_evidence for select using (
      provider_certification_id in (select id from provider_certifications where provider_id in (select id from providers where user_id = auth.uid()))
      or app.is_tenant_admin(tenant_id)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provider_certification_evidence' and policyname = 'Service role manages certification evidence') then
    create policy "Service role manages certification evidence" on provider_certification_evidence for all using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed: certification requirement thresholds for the categories already
-- seeded with service types in migration 016. Thresholds are illustrative
-- starting points (admin-editable), not synthetic provider data — no
-- provider_certifications rows are seeded here; those are only ever
-- computed from real provider metrics by evaluateCertifications.ts.
-- ─────────────────────────────────────────────────────────────────────────
insert into provider_certification_requirements (tenant_id, category, tier, min_completed_jobs, min_average_rating, min_trust_score, max_cancellation_rate)
select app.default_tenant_id(), category, tier.tier, tier.min_jobs, tier.min_rating, tier.min_trust, tier.max_cancel
from unnest(enum_range(null::service_category)) as category
cross join (values
  ('bronze', 3, 3.50, 0.50, 0.30),
  ('silver', 10, 4.00, 0.65, 0.20),
  ('gold', 25, 4.40, 0.78, 0.10),
  ('elite', 50, 4.70, 0.88, 0.05)
) as tier(tier, min_jobs, min_rating, min_trust, max_cancel)
on conflict (tenant_id, category, tier) do nothing;
