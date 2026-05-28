-- Velocity/JIT AI object governance: formula views, validation rules, and safe triggers.
-- Additive only. No drops, destructive rewrites, or remote migration repair.

create table if not exists provider_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null references providers(id) on delete cascade,
  document_type text not null,
  status text not null default 'pending',
  url text,
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  quote_id uuid not null references quotes(id) on delete cascade,
  job_id uuid,
  line_type text not null default 'other',
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_cents integer not null default 0,
  total_cents integer generated always as ((quantity * unit_price_cents)::integer) stored,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid not null references jobs(id) on delete cascade,
  quote_id uuid references quotes(id),
  provider_id uuid references providers(id),
  customer_id uuid references profiles(id),
  status text not null default 'submitted',
  reason text not null,
  amount_cents integer not null default 0,
  approved_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  job_id uuid references jobs(id),
  uploaded_by uuid references profiles(id),
  evidence_type text not null default 'file',
  url text,
  description text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_documents_tenant_provider_idx on provider_documents(tenant_id, provider_id, status);
create index if not exists quote_line_items_tenant_quote_idx on quote_line_items(tenant_id, quote_id);
create index if not exists change_orders_tenant_job_idx on change_orders(tenant_id, job_id, status);
create index if not exists dispute_evidence_tenant_dispute_idx on dispute_evidence(tenant_id, dispute_id);

alter table provider_documents enable row level security;
alter table quote_line_items enable row level security;
alter table change_orders enable row level security;
alter table dispute_evidence enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_documents' and policyname='Tenant admins manage provider documents') then
    create policy "Tenant admins manage provider documents" on provider_documents for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_documents' and policyname='Providers see own documents') then
    create policy "Providers see own documents" on provider_documents for select using (
      tenant_id = app.current_tenant_id()
      and exists (select 1 from providers where providers.id = provider_documents.provider_id and providers.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_line_items' and policyname='Tenant admins see quote line items') then
    create policy "Tenant admins see quote line items" on quote_line_items for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='change_orders' and policyname='Tenant admins manage change orders') then
    create policy "Tenant admins manage change orders" on change_orders for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='dispute_evidence' and policyname='Tenant admins see dispute evidence') then
    create policy "Tenant admins see dispute evidence" on dispute_evidence for select using (app.is_tenant_admin(tenant_id));
  end if;
end $$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles','providers','jobs','quotes','payments','disputes',
    'provider_documents','quote_line_items','change_orders','dispute_evidence',
    'job_checkins','job_photos','job_messages','provider_availability',
    'provider_settings','receipts','pricing_decisions','payment_ledger','payout_ledger'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=target_table and column_name='updated_at') then
      execute format('drop trigger if exists %I on %I', target_table || '_touch_updated_at', target_table);
      execute format('create trigger %I before update on %I for each row execute function app.touch_updated_at()', target_table || '_touch_updated_at', target_table);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='providers_service_radius_positive') then
    alter table providers add constraint providers_service_radius_positive check (service_radius_miles > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='quotes_total_positive_when_submitted') then
    alter table quotes add constraint quotes_total_positive_when_submitted check (total_cents > 0 or rejected_at is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='payments_amount_positive') then
    alter table payments add constraint payments_amount_positive check (amount_cents > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='reviews_one_per_job_reviewer') then
    alter table reviews add constraint reviews_one_per_job_reviewer unique (job_id, reviewer_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='automation_queue_retry_cap') then
    alter table automation_queue add constraint automation_queue_retry_cap check (retry_count <= 3) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='failed_automation_has_error') then
    alter table automation_queue add constraint failed_automation_has_error check (status <> 'failed' or error_message is not null) not valid;
  end if;
end $$;

create or replace function app.prevent_invalid_job_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.tenant_id is null or new.customer_id is null or new.category is null or coalesce(new.street, '') = '' or coalesce(new.city, '') = '' or coalesce(new.state, '') = '' or coalesce(new.zip, '') = '' then
      raise exception 'job tenant, customer, category, and address are required';
    end if;

    if new.status = 'arrived' and not exists (
      select 1 from job_checkins where tenant_id = new.tenant_id and job_id = new.id and status = 'arrived'
    ) then
      raise exception 'GPS check-in is required before arrived status';
    end if;

    if new.status = 'in_progress' and (
      not exists (select 1 from job_checkins where tenant_id = new.tenant_id and job_id = new.id and status = 'arrived')
      or not exists (select 1 from job_photos where tenant_id = new.tenant_id and job_id = new.id and photo_type = 'before')
    ) then
      raise exception 'arrival check-in and before photo are required before work starts';
    end if;

    if new.status in ('completed_pending_confirmation','completed','closed') and not exists (
      select 1 from job_photos where tenant_id = new.tenant_id and job_id = new.id and photo_type = 'after'
    ) then
      raise exception 'after photo is required before completion';
    end if;

    if new.status in ('closed','completed') and exists (
      select 1 from disputes where tenant_id = new.tenant_id and job_id = new.id and status in ('open','under_review','escalated')
    ) then
      raise exception 'job cannot close while dispute is open';
    end if;

    insert into job_status_history (tenant_id, job_id, from_status, to_status, metadata)
    values (new.tenant_id, new.id, old.status, new.status, jsonb_build_object('source', 'db_trigger'))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_prevent_invalid_transition on jobs;
create trigger jobs_prevent_invalid_transition
before update of status on jobs
for each row execute function app.prevent_invalid_job_transition();

create or replace function app.prevent_provider_approval_without_documents()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    if not exists (
      select 1 from provider_documents
      where tenant_id = new.tenant_id
        and provider_id = new.id
        and document_type in ('license','insurance')
        and status in ('verified','approved')
    ) and jsonb_array_length(coalesce(new.documents, '[]'::jsonb)) = 0 then
      raise exception 'provider cannot be approved without required documents';
    end if;
  end if;
  if new.is_online = true and new.status <> 'approved' then
    raise exception 'provider cannot go online without approved status';
  end if;
  return new;
end;
$$;

drop trigger if exists providers_validate_approval on providers;
create trigger providers_validate_approval
before update of status, is_online on providers
for each row execute function app.prevent_provider_approval_without_documents();

create or replace function app.freeze_payout_on_dispute()
returns trigger
language plpgsql
as $$
begin
  update payout_ledger
  set status = 'payout_hold', metadata = metadata || jsonb_build_object('hold_reason', 'open_dispute', 'dispute_id', new.id)
  where tenant_id = new.tenant_id and job_id = new.job_id and status not in ('payout_released','refunded');
  return new;
end;
$$;

drop trigger if exists disputes_freeze_payout on disputes;
create trigger disputes_freeze_payout
after insert on disputes
for each row execute function app.freeze_payout_on_dispute();

create or replace function app.prevent_payout_release_during_dispute()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'payout_released' and exists (
    select 1 from disputes where tenant_id = new.tenant_id and job_id = new.job_id and status in ('open','under_review','escalated')
  ) then
    raise exception 'payout cannot release while dispute is open';
  end if;
  return new;
end;
$$;

drop trigger if exists payout_ledger_block_release_on_dispute on payout_ledger;
create trigger payout_ledger_block_release_on_dispute
before update of status on payout_ledger
for each row execute function app.prevent_payout_release_during_dispute();

create or replace view velocity_job_formula_view as
select
  j.*,
  extract(epoch from (now() - j.created_at)) / 60.0 as job_age_minutes,
  case when j.accept_time is not null then extract(epoch from (j.accept_time - j.created_at)) / 60.0 end as time_to_accept_minutes,
  case when j.arrival_time is not null and j.dispatch_time is not null then extract(epoch from (j.arrival_time - j.dispatch_time)) / 60.0 end as time_to_arrive_minutes,
  case when j.completion_time is not null then extract(epoch from (j.completion_time - coalesce(j.actual_start, j.arrival_time, j.created_at))) / 60.0 end as time_to_complete_minutes,
  (j.urgency = 'emergency') as is_emergency,
  (j.status = 'disputed' or exists (select 1 from disputes d where d.tenant_id = j.tenant_id and d.job_id = j.id and d.status in ('open','under_review','escalated'))) as is_disputed,
  exists (select 1 from payments p where p.tenant_id = j.tenant_id and p.job_id = j.id and p.status = 'failed') as is_payment_failed,
  coalesce((select p.status::text from payments p where p.tenant_id = j.tenant_id and p.job_id = j.id order by p.created_at desc limit 1), 'not_started') as payment_status_label,
  coalesce((select pl.status from payout_ledger pl where pl.tenant_id = j.tenant_id and pl.job_id = j.id order by pl.created_at desc limit 1), 'not_queued') as payout_status_label,
  case
    when j.arrival_time is not null or j.checked_in_at is not null then 'arrived'
    when coalesce(j.dispatch_time, j.created_at) + case when j.urgency = 'emergency' then interval '60 minutes' when j.urgency = 'same_day' then interval '180 minutes' else interval '24 hours' end < now() then 'breach'
    when coalesce(j.dispatch_time, j.created_at) + case when j.urgency = 'emergency' then interval '60 minutes' when j.urgency = 'same_day' then interval '180 minutes' else interval '24 hours' end < now() + interval '30 minutes' then 'warning'
    else 'on_track'
  end as sla_status,
  (
    case when j.status in ('completed','closed','customer_confirmed') then 35 else 15 end
    + case when exists (select 1 from job_checkins c where c.tenant_id = j.tenant_id and c.job_id = j.id) then 20 else 0 end
    + case when exists (select 1 from job_photos ph where ph.tenant_id = j.tenant_id and ph.job_id = j.id and ph.photo_type = 'before') then 15 else 0 end
    + case when exists (select 1 from job_photos ph where ph.tenant_id = j.tenant_id and ph.job_id = j.id and ph.photo_type = 'after') then 15 else 0 end
    + case when not exists (select 1 from disputes d where d.tenant_id = j.tenant_id and d.job_id = j.id and d.status in ('open','under_review','escalated')) then 15 else 0 end
  ) as job_health_score,
  (
    coalesce(j.dispatch_time, j.created_at) + case when j.urgency = 'emergency' then interval '60 minutes' when j.urgency = 'same_day' then interval '180 minutes' else interval '24 hours' end < now()
    and j.arrival_time is null and j.checked_in_at is null
  ) as is_overdue
from jobs j;

create or replace view velocity_provider_formula_view as
select
  p.*,
  (select count(*) from jobs j where j.tenant_id = p.tenant_id and j.provider_id = p.id and j.status in ('accepted','scheduled','en_route','arrived','diagnosis_in_progress','in_progress')) as active_job_count,
  (select count(*) from jobs j where j.tenant_id = p.tenant_id and j.provider_id = p.id and j.status in ('completed','closed','customer_confirmed')) as completed_job_count,
  coalesce(p.cancellation_rate, 0) as calculated_cancellation_rate,
  greatest(0, least(100, round((coalesce(p.trust_score, 0) * 100)::numeric))) as on_time_rate,
  coalesce((select avg(r.rating) from reviews r where r.tenant_id = p.tenant_id and r.reviewee_id = p.user_id), 0) as average_rating,
  case when p.trust_score >= 0.85 then 'high' when p.trust_score >= 0.6 then 'medium' when p.trust_score >= 0.35 then 'low' else 'critical' end as trust_score_label,
  case when p.is_online and p.status = 'approved' then 'available' when p.status <> 'approved' then 'not_approved' else 'offline' end as availability_status,
  case
    when exists (select 1 from provider_documents d where d.tenant_id = p.tenant_id and d.provider_id = p.id and d.status in ('verified','approved')) or jsonb_array_length(coalesce(p.documents, '[]'::jsonb)) > 0 then 'compliant'
    else 'missing_documents'
  end as document_compliance_status,
  coalesce((select sum(amount) from payout_ledger pl where pl.tenant_id = p.tenant_id and pl.provider_id = p.id and pl.status = 'payout_hold'), 0) as payout_hold_amount
from providers p;

create or replace view velocity_customer_formula_view as
select
  pr.*,
  (select count(*) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id and j.status in ('completed','closed','customer_confirmed')) as completed_jobs_count,
  coalesce((select count(*)::numeric / nullif(count(j.*), 0) from jobs j left join disputes d on d.tenant_id = j.tenant_id and d.job_id = j.id where j.tenant_id = pr.tenant_id and j.customer_id = pr.id), 0) as dispute_rate,
  coalesce((select sum(coalesce(j.final_cost_cents, j.quoted_cost_cents, 0)) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id and j.status in ('completed','closed','customer_confirmed')), 0) as lifetime_value,
  (select max(created_at) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id) as last_booking_date,
  case
    when (select max(created_at) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id) is null then 'new'
    when (select max(created_at) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id) < now() - interval '180 days' then 'high'
    when (select max(created_at) from jobs j where j.tenant_id = pr.tenant_id and j.customer_id = pr.id) < now() - interval '90 days' then 'medium'
    else 'low'
  end as churn_risk_label
from profiles pr
where pr.role = 'customer';

create or replace view velocity_quote_formula_view as
select
  q.*,
  q.total_cents as quote_total,
  coalesce((select sum((item->>'total_cents')::integer) from jsonb_array_elements(q.line_items) item where item->>'type' in ('parts','materials')), 0) as materials_total,
  coalesce((select sum((item->>'total_cents')::integer) from jsonb_array_elements(q.line_items) item where item->>'type' = 'labor'), 0) as labor_total,
  greatest(round(q.total_cents * 0.12), 0)::integer as platform_fee,
  greatest(q.total_cents - greatest(round(q.total_cents * 0.12), 0)::integer, 0) as provider_expected_payout,
  case when q.total_cents > coalesce(j.estimated_cost_cents, q.total_cents) * 1.5 then 'high' when q.total_cents < coalesce(j.estimated_cost_cents, q.total_cents) * 0.6 then 'low' else 'fair' end as quote_fairness_label,
  (q.total_cents > coalesce(j.estimated_cost_cents, q.total_cents) * 1.5 or q.total_cents >= 250000) as requires_admin_review
from quotes q
left join jobs j on j.id = q.job_id and j.tenant_id = q.tenant_id;

create or replace view velocity_payment_formula_view as
select
  p.*,
  greatest(p.platform_fee_cents - coalesce((select sum(r.amount) from refund_records r where r.tenant_id = p.tenant_id and r.payment_id = p.id and r.status in ('refunded','succeeded')), 0), 0) as net_platform_revenue,
  p.provider_payout_cents as provider_payout_amount,
  coalesce((select sum(r.amount) from refund_records r where r.tenant_id = p.tenant_id and r.payment_id = p.id), 0) as refund_amount_total,
  (p.status = 'failed') as is_payment_failed,
  exists (select 1 from disputes d where d.tenant_id = p.tenant_id and d.job_id = p.job_id and d.status in ('open','under_review','escalated')) as is_payout_blocked
from payments p;

create or replace view velocity_dispute_formula_view as
select
  d.*,
  extract(epoch from (now() - d.created_at)) / 3600.0 as dispute_age_hours,
  coalesce(array_length(d.evidence_urls, 1), 0) + coalesce((select count(*) from dispute_evidence e where e.tenant_id = d.tenant_id and e.dispute_id = d.id), 0) as evidence_count,
  exists (select 1 from payout_ledger pl where pl.tenant_id = d.tenant_id and pl.job_id = d.job_id and pl.status = 'payout_hold') as has_payment_hold,
  case when d.resolved_at is not null then 'resolved' when d.created_at < now() - interval '72 hours' then 'breach' when d.created_at < now() - interval '48 hours' then 'warning' else 'on_track' end as resolution_sla_status,
  coalesce(d.ai_recommendation->>'recommendation', 'not_run') as ivy_recommendation_status
from disputes d;

create or replace view velocity_automation_formula_view as
select
  q.*,
  extract(epoch from (now() - q.created_at)) / 60.0 as queue_age_minutes,
  case when q.retry_count = 0 then 'not_retried' when q.retry_count < 3 then 'retrying' else 'max_retries' end as retry_status,
  (q.status = 'pending' and q.created_at < now() - interval '30 minutes') as is_stuck,
  case when q.status = 'failed' then 'critical' when q.status = 'pending' and q.created_at < now() - interval '30 minutes' then 'warning' else 'healthy' end as automation_health_label
from automation_queue q;

create or replace view velocity_agent_log_formula_view as
select
  l.*,
  case
    when coalesce((l.output->>'confidence')::numeric, 1) >= 0.8 then 'high'
    when coalesce((l.output->>'confidence')::numeric, 1) >= 0.5 then 'medium'
    else 'low'
  end as confidence_label,
  (l.error is not null or coalesce((l.output->>'confidence')::numeric, 1) < 0.5) as requires_human_review,
  l.latency_ms as run_duration_ms
from agent_logs l;
