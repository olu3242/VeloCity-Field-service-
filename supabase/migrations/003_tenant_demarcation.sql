-- VeloCity Field Service - Tenant demarcation
-- Adds tenant_id boundaries for multi-tenant data separation.

create schema if not exists app;

create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tenants (id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'velocity-default', 'VeloCity Default Tenant')
on conflict (id) do nothing;

create or replace function app.default_tenant_id()
returns uuid language sql immutable as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

alter table profiles add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table service_areas add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table providers add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table customer_addresses add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table jobs add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table job_status_history add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table quotes add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table payments add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table reviews add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table disputes add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table provider_offers add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table subscriptions add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table notifications add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table agent_logs add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();
alter table audit_logs add column if not exists tenant_id uuid references tenants(id) default app.default_tenant_id();

update profiles set tenant_id = app.default_tenant_id() where tenant_id is null;
update service_areas set tenant_id = app.default_tenant_id() where tenant_id is null;
update providers set tenant_id = app.default_tenant_id() where tenant_id is null;
update customer_addresses set tenant_id = app.default_tenant_id() where tenant_id is null;
update jobs set tenant_id = app.default_tenant_id() where tenant_id is null;
update job_status_history set tenant_id = app.default_tenant_id() where tenant_id is null;
update quotes set tenant_id = app.default_tenant_id() where tenant_id is null;
update payments set tenant_id = app.default_tenant_id() where tenant_id is null;
update reviews set tenant_id = app.default_tenant_id() where tenant_id is null;
update disputes set tenant_id = app.default_tenant_id() where tenant_id is null;
update provider_offers set tenant_id = app.default_tenant_id() where tenant_id is null;
update subscriptions set tenant_id = app.default_tenant_id() where tenant_id is null;
update notifications set tenant_id = app.default_tenant_id() where tenant_id is null;
update agent_logs set tenant_id = app.default_tenant_id() where tenant_id is null;
update audit_logs set tenant_id = app.default_tenant_id() where tenant_id is null;

alter table profiles alter column tenant_id set not null;
alter table service_areas alter column tenant_id set not null;
alter table providers alter column tenant_id set not null;
alter table customer_addresses alter column tenant_id set not null;
alter table jobs alter column tenant_id set not null;
alter table job_status_history alter column tenant_id set not null;
alter table quotes alter column tenant_id set not null;
alter table payments alter column tenant_id set not null;
alter table reviews alter column tenant_id set not null;
alter table disputes alter column tenant_id set not null;
alter table provider_offers alter column tenant_id set not null;
alter table subscriptions alter column tenant_id set not null;
alter table notifications alter column tenant_id set not null;
alter table agent_logs alter column tenant_id set not null;
alter table audit_logs alter column tenant_id set not null;

create index if not exists profiles_tenant_id_idx on profiles(tenant_id);
create index if not exists service_areas_tenant_id_idx on service_areas(tenant_id);
create index if not exists providers_tenant_id_idx on providers(tenant_id);
create index if not exists jobs_tenant_id_idx on jobs(tenant_id);
create index if not exists quotes_tenant_id_idx on quotes(tenant_id);
create index if not exists payments_tenant_id_idx on payments(tenant_id);
create index if not exists disputes_tenant_id_idx on disputes(tenant_id);
create index if not exists provider_offers_tenant_id_idx on provider_offers(tenant_id);
create index if not exists notifications_tenant_id_idx on notifications(tenant_id);
create index if not exists agent_logs_tenant_id_idx on agent_logs(tenant_id);
create index if not exists audit_logs_tenant_id_idx on audit_logs(tenant_id);

alter table tenants enable row level security;

create or replace function app.current_tenant_id()
returns uuid language plpgsql stable security definer as $$
declare
  jwt_tenant uuid;
  profile_tenant uuid;
  remote_user_tenant uuid;
begin
  jwt_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  if jwt_tenant is not null then
    return jwt_tenant;
  end if;

  select tenant_id into profile_tenant
  from public.profiles
  where id = auth.uid();
  if profile_tenant is not null then
    return profile_tenant;
  end if;

  if to_regclass('public.users') is not null then
    execute 'select tenant_id from public.users where auth_uid = $1 limit 1'
      into remote_user_tenant
      using auth.uid();
    if remote_user_tenant is not null then
      return remote_user_tenant;
    end if;
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
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and tenant_id = target_tenant_id
  ) into is_velocity_admin;

  if is_velocity_admin then
    return true;
  end if;

  if to_regclass('public.users') is not null then
    execute 'select exists(select 1 from public.users where auth_uid = $1 and role in (''super_admin'', ''tenant_admin'') and tenant_id = $2)'
      into is_remote_admin
      using auth.uid(), target_tenant_id;
  end if;

  return coalesce(is_remote_admin, false);
end;
$$;

create policy "Users see own tenant" on tenants for select using (
  id = app.current_tenant_id()
);

alter policy "Users can view own profile" on profiles
  using (auth.uid() = id and tenant_id = app.current_tenant_id());

alter policy "Users can update own profile" on profiles
  using (auth.uid() = id and tenant_id = app.current_tenant_id());

alter policy "Admins can view all profiles" on profiles
  using (app.is_tenant_admin(tenant_id));

alter policy "Customers see own jobs" on jobs
  using (auth.uid() = customer_id and tenant_id = app.current_tenant_id());

alter policy "Providers see assigned jobs" on jobs
  using (
    tenant_id = app.current_tenant_id()
    and exists(select 1 from providers where user_id = auth.uid() and id = jobs.provider_id and tenant_id = jobs.tenant_id)
  );

alter policy "Admins see all jobs" on jobs
  using (app.is_tenant_admin(tenant_id));

alter policy "Customers create jobs" on jobs
  with check (auth.uid() = customer_id and tenant_id = app.current_tenant_id());

alter policy "Users see own notifications" on notifications
  using (auth.uid() = user_id and tenant_id = app.current_tenant_id());

alter policy "Users update own notifications" on notifications
  using (auth.uid() = user_id and tenant_id = app.current_tenant_id());

alter policy "Customers manage own addresses" on customer_addresses
  using (auth.uid() = customer_id and tenant_id = app.current_tenant_id());

alter policy "Approved providers visible to all" on providers
  using (
    tenant_id = app.current_tenant_id()
    and (
      status = 'approved'
      or user_id = auth.uid()
      or app.is_tenant_admin(tenant_id)
    )
  );

alter policy "Admins see audit logs" on audit_logs
  using (app.is_tenant_admin(tenant_id));

alter policy "Admins insert audit logs" on audit_logs
  with check (app.is_tenant_admin(tenant_id));

alter policy "Service areas visible to authenticated users" on service_areas
  using (auth.role() = 'authenticated' and tenant_id = app.current_tenant_id());

alter policy "Providers create own application" on providers
  with check (auth.uid() = user_id and tenant_id = app.current_tenant_id());

alter policy "Providers update own profile" on providers
  using (auth.uid() = user_id and tenant_id = app.current_tenant_id());

alter policy "Admins update providers" on providers
  using (app.is_tenant_admin(tenant_id));

alter policy "Customers update own jobs" on jobs
  using (auth.uid() = customer_id and tenant_id = app.current_tenant_id());

alter policy "Assigned providers update jobs" on jobs
  using (
    tenant_id = app.current_tenant_id()
    and exists(select 1 from providers where user_id = auth.uid() and id = jobs.provider_id and tenant_id = jobs.tenant_id)
  );

alter policy "Admins update jobs" on jobs
  using (app.is_tenant_admin(tenant_id));

alter policy "Users see related job history" on job_status_history
  using (
    tenant_id = app.current_tenant_id()
    and (
      exists(select 1 from jobs where jobs.id = job_status_history.job_id and jobs.customer_id = auth.uid() and jobs.tenant_id = job_status_history.tenant_id)
      or exists(select 1 from jobs join providers on providers.id = jobs.provider_id where jobs.id = job_status_history.job_id and providers.user_id = auth.uid() and jobs.tenant_id = job_status_history.tenant_id)
      or app.is_tenant_admin(tenant_id)
    )
  );

alter policy "Users insert related job history" on job_status_history
  with check (
    tenant_id = app.current_tenant_id()
    and (actor_id = auth.uid() or app.is_tenant_admin(tenant_id))
  );

alter policy "Users see related quotes" on quotes
  using (
    tenant_id = app.current_tenant_id()
    and (
      exists(select 1 from jobs where jobs.id = quotes.job_id and jobs.customer_id = auth.uid() and jobs.tenant_id = quotes.tenant_id)
      or exists(select 1 from providers where providers.id = quotes.provider_id and providers.user_id = auth.uid() and providers.tenant_id = quotes.tenant_id)
      or app.is_tenant_admin(tenant_id)
    )
  );

alter policy "Assigned providers create quotes" on quotes
  with check (
    tenant_id = app.current_tenant_id()
    and exists(select 1 from providers where providers.id = quotes.provider_id and providers.user_id = auth.uid() and providers.tenant_id = quotes.tenant_id)
  );

alter policy "Customers update related quotes" on quotes
  using (
    tenant_id = app.current_tenant_id()
    and exists(select 1 from jobs where jobs.id = quotes.job_id and jobs.customer_id = auth.uid() and jobs.tenant_id = quotes.tenant_id)
  );

alter policy "Users see related payments" on payments
  using (
    tenant_id = app.current_tenant_id()
    and (
      customer_id = auth.uid()
      or exists(select 1 from providers where providers.id = payments.provider_id and providers.user_id = auth.uid() and providers.tenant_id = payments.tenant_id)
      or app.is_tenant_admin(tenant_id)
    )
  );

alter policy "Customers create own payments" on payments
  with check (customer_id = auth.uid() and tenant_id = app.current_tenant_id());

alter policy "Users see related disputes" on disputes
  using (
    tenant_id = app.current_tenant_id()
    and (initiated_by = auth.uid() or against = auth.uid() or app.is_tenant_admin(tenant_id))
  );

alter policy "Users create related disputes" on disputes
  with check (initiated_by = auth.uid() and tenant_id = app.current_tenant_id());

alter policy "Providers see own offers" on provider_offers
  using (
    tenant_id = app.current_tenant_id()
    and (
      exists(select 1 from providers where providers.id = provider_offers.provider_id and providers.user_id = auth.uid() and providers.tenant_id = provider_offers.tenant_id)
      or app.is_tenant_admin(tenant_id)
    )
  );

alter policy "Providers update own offers" on provider_offers
  using (
    tenant_id = app.current_tenant_id()
    and exists(select 1 from providers where providers.id = provider_offers.provider_id and providers.user_id = auth.uid() and providers.tenant_id = provider_offers.tenant_id)
  );

alter policy "Admins manage offers" on provider_offers
  using (app.is_tenant_admin(tenant_id));

alter policy "Users see related reviews" on reviews
  using (
    tenant_id = app.current_tenant_id()
    and (is_public or reviewer_id = auth.uid() or reviewee_id = auth.uid())
  );

alter policy "Customers create job reviews" on reviews
  with check (reviewer_id = auth.uid() and tenant_id = app.current_tenant_id());

alter policy "Admins see agent logs" on agent_logs
  using (app.is_tenant_admin(tenant_id));

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, tenant_id, full_name, avatar_url)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'tenant_id')::uuid, app.default_tenant_id()),
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create or replace function log_job_status_change()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    insert into job_status_history(job_id, tenant_id, from_status, to_status)
    values (new.id, new.tenant_id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop view if exists job_events;
create view job_events as
select
  id,
  tenant_id,
  job_id,
  from_status,
  to_status,
  actor_id,
  actor_role,
  reason,
  metadata,
  created_at
from job_status_history;
