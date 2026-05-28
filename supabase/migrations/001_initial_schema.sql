create extension if not exists pgcrypto;

-- VeloCity Field Service - Initial Schema
-- Migration 001: Core tables

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('customer', 'provider', 'admin');

create type provider_status as enum (
  'pending', 'under_review', 'approved', 'suspended', 'rejected'
);

create type job_status as enum (
  'draft',
  'submitted',
  'awaiting_serviceability',
  'awaiting_match',
  'offer_sent',
  'accepted',
  'scheduled',
  'deposit_required',
  'deposit_paid',
  'en_route',
  'arrived',
  'diagnosis_in_progress',
  'quote_submitted',
  'awaiting_quote_approval',
  'quote_approved',
  'in_progress',
  'change_order_submitted',
  'awaiting_change_order_approval',
  'change_order_approved',
  'completed_pending_confirmation',
  'customer_confirmed',
  'completed',
  'disputed',
  'refund_pending',
  'refunded',
  'warranty_callback_open',
  'cancelled',
  'no_show',
  'expired',
  'closed'
);

create type urgency_level as enum ('scheduled', 'same_day', 'emergency');

create type payment_status as enum (
  'pending', 'authorized', 'captured', 'escrowed',
  'released', 'refunded', 'failed', 'cancelled'
);

create type dispute_status as enum (
  'open', 'under_review', 'resolved_for_customer',
  'resolved_for_provider', 'escalated', 'closed'
);

create type service_category as enum (
  'plumbing', 'electrical', 'hvac', 'cleaning', 'landscaping',
  'pest_control', 'appliance_repair', 'locksmith', 'handyman',
  'painting', 'roofing', 'flooring', 'carpentry', 'moving',
  'pool_service', 'garage_door', 'windows', 'other'
);

create type notification_channel as enum ('sms', 'email', 'push', 'in_app');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text,
  phone text,
  avatar_url text,
  stripe_customer_id text unique,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SERVICE AREAS
-- ============================================================

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  zip_codes text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROVIDERS
-- ============================================================

create table providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  business_name text not null,
  business_license text,
  insurance_number text,
  insurance_expiry date,
  categories service_category[] not null default '{}',
  service_area_ids uuid[] not null default '{}',
  service_radius_miles integer not null default 25,
  hourly_rate_cents integer,
  bio text,
  years_experience integer default 0,
  status provider_status not null default 'pending',
  trust_score numeric(3,2) not null default 0.00,
  completed_jobs integer not null default 0,
  cancellation_rate numeric(4,3) not null default 0.000,
  response_time_minutes integer,
  stripe_account_id text unique,
  stripe_account_status text,
  is_online boolean not null default false,
  last_location point,
  documents jsonb default '[]',
  admin_notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS (extended profile data)
-- ============================================================

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  label text not null default 'Home',
  street text not null,
  unit text,
  city text not null,
  state text not null,
  zip text not null,
  country text not null default 'US',
  location point,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- JOBS
-- ============================================================

create table jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  provider_id uuid references providers(id),
  category service_category not null,
  title text not null,
  description text not null,
  urgency urgency_level not null default 'scheduled',
  status job_status not null default 'draft',

  -- Address
  address_id uuid references customer_addresses(id),
  street text,
  unit text,
  city text,
  state text,
  zip text,
  location point,

  -- Scheduling
  preferred_date date,
  preferred_time_start time,
  preferred_time_end time,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,

  -- Media
  photo_urls text[] default '{}',
  document_urls text[] default '{}',

  -- Pricing
  estimated_cost_cents integer,
  quoted_cost_cents integer,
  final_cost_cents integer,
  deposit_amount_cents integer,
  platform_fee_cents integer,

  -- OTP for check-in
  checkin_otp text,
  checkin_otp_expires_at timestamptz,
  checked_in_at timestamptz,

  -- Metadata
  ai_classification jsonb default '{}',
  ai_match_scores jsonb default '{}',
  internal_notes text,
  customer_notes text,
  provider_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- JOB STATUS HISTORY
-- ============================================================

create table job_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  from_status job_status,
  to_status job_status not null,
  actor_id uuid references profiles(id),
  actor_role user_role,
  reason text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- QUOTES
-- ============================================================

create table quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  provider_id uuid not null references providers(id),
  is_change_order boolean not null default false,
  parent_quote_id uuid references quotes(id),
  line_items jsonb not null default '[]',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  deposit_required_cents integer default 0,
  notes text,
  valid_until timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS
-- ============================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  customer_id uuid not null references profiles(id),
  provider_id uuid references providers(id),
  stripe_payment_intent_id text unique,
  stripe_transfer_id text unique,
  amount_cents integer not null,
  platform_fee_cents integer not null default 0,
  provider_payout_cents integer not null default 0,
  currency text not null default 'usd',
  status payment_status not null default 'pending',
  type text not null, -- 'deposit', 'final', 'refund'
  metadata jsonb default '{}',
  captured_at timestamptz,
  payout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- REVIEWS
-- ============================================================

create table reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id),
  reviewer_id uuid not null references profiles(id),
  reviewee_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  response text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DISPUTES
-- ============================================================

create table disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  initiated_by uuid not null references profiles(id),
  against uuid not null references profiles(id),
  status dispute_status not null default 'open',
  reason text not null,
  description text,
  evidence_urls text[] default '{}',
  resolution_notes text,
  refund_amount_cents integer,
  ai_recommendation jsonb default '{}',
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROVIDER OFFERS (job matching)
-- ============================================================

create table provider_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  provider_id uuid not null references providers(id),
  match_score numeric(4,3),
  ai_reasoning text,
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  unique(job_id, provider_id)
);

-- ============================================================
-- SUBSCRIPTIONS (recurring service plans)
-- ============================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  provider_id uuid references providers(id),
  stripe_subscription_id text unique,
  stripe_price_id text,
  category service_category,
  plan_name text not null,
  interval text not null, -- 'weekly', 'monthly', 'quarterly'
  amount_cents integer not null,
  status text not null default 'active',
  next_service_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  channel notification_channel not null,
  title text not null,
  body text not null,
  data jsonb default '{}',
  is_read boolean not null default false,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AI AGENT LOGS
-- ============================================================

create table agent_logs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  job_id uuid references jobs(id),
  user_id uuid references profiles(id),
  action text not null,
  input jsonb default '{}',
  output jsonb default '{}',
  tokens_used integer,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index jobs_customer_id_idx on jobs(customer_id);
create index jobs_provider_id_idx on jobs(provider_id);
create index jobs_status_idx on jobs(status);
create index jobs_category_idx on jobs(category);
create index jobs_created_at_idx on jobs(created_at desc);
create index providers_status_idx on providers(status);
create index providers_categories_idx on providers using gin(categories);
create index providers_trust_score_idx on providers(trust_score desc);
create index job_status_history_job_id_idx on job_status_history(job_id);
create index notifications_user_id_idx on notifications(user_id);
create index notifications_unread_idx on notifications(user_id, is_read) where not is_read;
create index agent_logs_job_id_idx on agent_logs(job_id);
create index payments_job_id_idx on payments(job_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table job_status_history enable row level security;
alter table quotes enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;
alter table disputes enable row level security;
alter table provider_offers enable row level security;
alter table notifications enable row level security;
alter table providers enable row level security;
alter table customer_addresses enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles" on profiles for select using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Jobs: customers see own jobs, providers see assigned jobs, admins see all
create policy "Customers see own jobs" on jobs for select using (auth.uid() = customer_id);
create policy "Providers see assigned jobs" on jobs for select using (
  exists(select 1 from providers where user_id = auth.uid() and id = jobs.provider_id)
);
create policy "Admins see all jobs" on jobs for select using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Customers create jobs" on jobs for insert with check (auth.uid() = customer_id);

-- Notifications: users see own
create policy "Users see own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications" on notifications for update using (auth.uid() = user_id);

-- Customer addresses: own only
create policy "Customers manage own addresses" on customer_addresses
  for all using (auth.uid() = customer_id);

-- Providers: approved providers are viewable by all authenticated users
create policy "Approved providers visible to all" on providers for select using (
  status = 'approved' or user_id = auth.uid() or
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger jobs_updated_at before update on jobs
  for each row execute function update_updated_at();
create trigger providers_updated_at before update on providers
  for each row execute function update_updated_at();
create trigger payments_updated_at before update on payments
  for each row execute function update_updated_at();
create trigger disputes_updated_at before update on disputes
  for each row execute function update_updated_at();

-- Log job status changes automatically
create or replace function log_job_status_change()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    insert into job_status_history(job_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger jobs_status_change after update on jobs
  for each row execute function log_job_status_change();

-- Auto-create profile on sign up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Update provider trust score
create or replace function update_provider_trust_score(p_provider_id uuid)
returns void language plpgsql as $$
declare
  v_avg_rating numeric;
  v_completion_rate numeric;
  v_response_score numeric;
  v_new_score numeric;
begin
  select avg(rating) into v_avg_rating
  from reviews r
  join jobs j on j.id = r.job_id
  where j.provider_id = p_provider_id;

  select (1.0 - cancellation_rate) into v_completion_rate
  from providers where id = p_provider_id;

  v_new_score := (
    coalesce(v_avg_rating, 3.0) / 5.0 * 0.6 +
    coalesce(v_completion_rate, 1.0) * 0.4
  );

  update providers set trust_score = v_new_score
  where id = p_provider_id;
end;
$$;
