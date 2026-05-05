-- VeloCity Field Service - Production hardening
-- Adds missing audit primitives and RLS policies needed by the MVP routes.

create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id),
  actor_role user_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table service_areas add constraint service_areas_name_key unique (name);

alter table audit_logs enable row level security;
alter table subscriptions enable row level security;
alter table service_areas enable row level security;

create policy "Admins see audit logs" on audit_logs for select using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins insert audit logs" on audit_logs for insert with check (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Service areas visible to authenticated users" on service_areas for select using (auth.role() = 'authenticated');

create policy "Providers create own application" on providers for insert with check (auth.uid() = user_id);

create policy "Providers update own profile" on providers for update using (auth.uid() = user_id);

create policy "Admins update providers" on providers for update using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Customers update own jobs" on jobs for update using (auth.uid() = customer_id);

create policy "Assigned providers update jobs" on jobs for update using (
  exists(select 1 from providers where user_id = auth.uid() and id = jobs.provider_id)
);

create policy "Admins update jobs" on jobs for update using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users see related job history" on job_status_history for select using (
  exists(select 1 from jobs where jobs.id = job_status_history.job_id and jobs.customer_id = auth.uid())
  or exists(select 1 from jobs join providers on providers.id = jobs.provider_id where jobs.id = job_status_history.job_id and providers.user_id = auth.uid())
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users insert related job history" on job_status_history for insert with check (
  actor_id = auth.uid()
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users see related quotes" on quotes for select using (
  exists(select 1 from jobs where jobs.id = quotes.job_id and jobs.customer_id = auth.uid())
  or exists(select 1 from providers where providers.id = quotes.provider_id and providers.user_id = auth.uid())
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Assigned providers create quotes" on quotes for insert with check (
  exists(select 1 from providers where providers.id = quotes.provider_id and providers.user_id = auth.uid())
);

create policy "Customers update related quotes" on quotes for update using (
  exists(select 1 from jobs where jobs.id = quotes.job_id and jobs.customer_id = auth.uid())
);

create policy "Users see related payments" on payments for select using (
  customer_id = auth.uid()
  or exists(select 1 from providers where providers.id = payments.provider_id and providers.user_id = auth.uid())
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Customers create own payments" on payments for insert with check (customer_id = auth.uid());

create policy "Users see related disputes" on disputes for select using (
  initiated_by = auth.uid()
  or against = auth.uid()
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users create related disputes" on disputes for insert with check (initiated_by = auth.uid());

create policy "Providers see own offers" on provider_offers for select using (
  exists(select 1 from providers where providers.id = provider_offers.provider_id and providers.user_id = auth.uid())
  or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Providers update own offers" on provider_offers for update using (
  exists(select 1 from providers where providers.id = provider_offers.provider_id and providers.user_id = auth.uid())
);

create policy "Admins manage offers" on provider_offers for all using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "Users see related reviews" on reviews for select using (
  is_public or reviewer_id = auth.uid() or reviewee_id = auth.uid()
);

create policy "Customers create job reviews" on reviews for insert with check (reviewer_id = auth.uid());

create policy "Admins see agent logs" on agent_logs for select using (
  exists(select 1 from profiles where id = auth.uid() and role = 'admin')
);

create or replace view job_events as
select
  id,
  job_id,
  from_status,
  to_status,
  actor_id,
  actor_role,
  reason,
  metadata,
  created_at
from job_status_history;
