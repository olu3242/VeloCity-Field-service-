-- Velocity/JIT AI pricing and payment automation. Additive only.

create table if not exists pricing_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  quote_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'proposed',
  pricing_mode text not null default 'quote_after_inspection',
  result jsonb not null default '{}',
  risk_flags text[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  payment_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending',
  entry_type text not null default 'payment',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payout_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  payment_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'payout_pending',
  retry_count integer not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refund_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  payment_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'refund_pending',
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_retries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  payment_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'scheduled',
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid,
  customer_id uuid,
  provider_id uuid,
  subscription_id text,
  amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending',
  event_type text not null default 'subscription_event',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_decisions_tenant_idx on pricing_decisions(tenant_id);
create index if not exists pricing_decisions_job_idx on pricing_decisions(job_id);
create index if not exists pricing_decisions_status_idx on pricing_decisions(status);
create index if not exists pricing_decisions_created_idx on pricing_decisions(created_at desc);
create index if not exists payment_ledger_tenant_idx on payment_ledger(tenant_id);
create index if not exists payment_ledger_job_idx on payment_ledger(job_id);
create index if not exists payment_ledger_status_idx on payment_ledger(status);
create index if not exists payment_ledger_created_idx on payment_ledger(created_at desc);
create index if not exists payout_ledger_tenant_idx on payout_ledger(tenant_id);
create index if not exists payout_ledger_job_idx on payout_ledger(job_id);
create index if not exists payout_ledger_status_idx on payout_ledger(status);
create index if not exists refund_records_tenant_idx on refund_records(tenant_id);
create index if not exists refund_records_job_idx on refund_records(job_id);
create index if not exists refund_records_status_idx on refund_records(status);
create index if not exists payment_retries_tenant_idx on payment_retries(tenant_id);
create index if not exists payment_retries_job_idx on payment_retries(job_id);
create index if not exists payment_retries_status_idx on payment_retries(status);
create index if not exists subscription_events_tenant_idx on subscription_events(tenant_id);
create index if not exists subscription_events_job_idx on subscription_events(job_id);
create index if not exists subscription_events_status_idx on subscription_events(status);

alter table pricing_decisions enable row level security;
alter table payment_ledger enable row level security;
alter table payout_ledger enable row level security;
alter table refund_records enable row level security;
alter table payment_retries enable row level security;
alter table subscription_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pricing_decisions' and policyname='Tenant admins manage pricing decisions') then
    create policy "Tenant admins manage pricing decisions" on pricing_decisions for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_ledger' and policyname='Tenant admins see payment ledger') then
    create policy "Tenant admins see payment ledger" on payment_ledger for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payout_ledger' and policyname='Tenant admins see payout ledger') then
    create policy "Tenant admins see payout ledger" on payout_ledger for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='refund_records' and policyname='Tenant admins see refunds') then
    create policy "Tenant admins see refunds" on refund_records for select using (app.is_tenant_admin(tenant_id));
  end if;
end $$;
