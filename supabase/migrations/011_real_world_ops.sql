-- Velocity/JIT AI real-world operations layer. Additive only.

create table if not exists job_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid not null,
  provider_id uuid not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  distance_from_job numeric(10,2),
  status text not null check (status in ('arrived', 'departed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid not null,
  uploaded_by uuid not null,
  uploader_role text not null check (uploader_role in ('customer', 'provider', 'admin')),
  photo_type text not null check (photo_type in ('before', 'during', 'after', 'evidence')),
  url text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid not null,
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('customer', 'provider', 'admin')),
  message text not null,
  attachments jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  provider_id uuid not null,
  service_radius_km numeric(8,2) not null default 40,
  max_jobs_per_day integer not null default 4,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id)
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) default app.default_tenant_id(),
  job_id uuid not null,
  customer_id uuid not null,
  provider_id uuid,
  amount integer not null default 0,
  currency text not null default 'usd',
  breakdown jsonb not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jobs add column if not exists dispatch_time timestamptz;
alter table jobs add column if not exists accept_time timestamptz;
alter table jobs add column if not exists arrival_time timestamptz;
alter table jobs add column if not exists completion_time timestamptz;
alter table jobs add column if not exists receipt_id uuid;

create index if not exists job_checkins_tenant_job_idx on job_checkins(tenant_id, job_id, created_at desc);
create index if not exists job_checkins_provider_idx on job_checkins(provider_id, created_at desc);
create index if not exists job_photos_tenant_job_idx on job_photos(tenant_id, job_id, photo_type, created_at desc);
create index if not exists job_messages_tenant_job_idx on job_messages(tenant_id, job_id, created_at asc);
create index if not exists provider_availability_provider_idx on provider_availability(tenant_id, provider_id, day_of_week);
create index if not exists provider_settings_provider_idx on provider_settings(tenant_id, provider_id);
create index if not exists receipts_tenant_job_idx on receipts(tenant_id, job_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

alter table job_checkins enable row level security;
alter table job_photos enable row level security;
alter table job_messages enable row level security;
alter table provider_availability enable row level security;
alter table provider_settings enable row level security;
alter table receipts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_checkins' and policyname='Tenant admins see job checkins') then
    create policy "Tenant admins see job checkins" on job_checkins for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_checkins' and policyname='Tenant users see job checkins') then
    create policy "Tenant users see job checkins" on job_checkins for select using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (
        select 1 from jobs
        where jobs.id = job_checkins.job_id
          and jobs.tenant_id = job_checkins.tenant_id
          and (
            jobs.customer_id = auth.uid()
            or exists (select 1 from providers where providers.id = jobs.provider_id and providers.user_id = auth.uid())
          )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_checkins' and policyname='Assigned providers insert job checkins') then
    create policy "Assigned providers insert job checkins" on job_checkins for insert with check (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (
        select 1 from jobs
        join providers on providers.id = jobs.provider_id
        where jobs.id = job_checkins.job_id
          and jobs.tenant_id = job_checkins.tenant_id
          and providers.id = job_checkins.provider_id
          and providers.user_id = auth.uid()
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_photos' and policyname='Tenant admins see job photos') then
    create policy "Tenant admins see job photos" on job_photos for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_photos' and policyname='Tenant users see job photos') then
    create policy "Tenant users see job photos" on job_photos for select using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (
        select 1 from jobs
        where jobs.id = job_photos.job_id
          and jobs.tenant_id = job_photos.tenant_id
          and (
            jobs.customer_id = auth.uid()
            or exists (select 1 from providers where providers.id = jobs.provider_id and providers.user_id = auth.uid())
          )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_photos' and policyname='Tenant users insert job photos') then
    create policy "Tenant users insert job photos" on job_photos for insert with check (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and uploaded_by = auth.uid()
      and exists (
        select 1 from jobs
        where jobs.id = job_photos.job_id
          and jobs.tenant_id = job_photos.tenant_id
          and (
            jobs.customer_id = auth.uid()
            or exists (select 1 from providers where providers.id = jobs.provider_id and providers.user_id = auth.uid())
          )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_messages' and policyname='Tenant admins see job messages') then
    create policy "Tenant admins see job messages" on job_messages for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_messages' and policyname='Tenant users see job messages') then
    create policy "Tenant users see job messages" on job_messages for select using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (
        select 1 from jobs
        where jobs.id = job_messages.job_id
          and jobs.tenant_id = job_messages.tenant_id
          and (
            jobs.customer_id = auth.uid()
            or exists (select 1 from providers where providers.id = jobs.provider_id and providers.user_id = auth.uid())
          )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_messages' and policyname='Tenant users insert job messages') then
    create policy "Tenant users insert job messages" on job_messages for insert with check (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and sender_id = auth.uid()
      and exists (
        select 1 from jobs
        where jobs.id = job_messages.job_id
          and jobs.tenant_id = job_messages.tenant_id
          and (
            jobs.customer_id = auth.uid()
            or exists (select 1 from providers where providers.id = jobs.provider_id and providers.user_id = auth.uid())
          )
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_availability' and policyname='Tenant admins see provider availability') then
    create policy "Tenant admins see provider availability" on provider_availability for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_availability' and policyname='Providers manage own availability') then
    create policy "Providers manage own availability" on provider_availability for all using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (select 1 from providers where providers.id = provider_availability.provider_id and providers.user_id = auth.uid())
    ) with check (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (select 1 from providers where providers.id = provider_availability.provider_id and providers.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_settings' and policyname='Tenant admins see provider settings') then
    create policy "Tenant admins see provider settings" on provider_settings for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='provider_settings' and policyname='Providers manage own settings') then
    create policy "Providers manage own settings" on provider_settings for all using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (select 1 from providers where providers.id = provider_settings.provider_id and providers.user_id = auth.uid())
    ) with check (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and exists (select 1 from providers where providers.id = provider_settings.provider_id and providers.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='receipts' and policyname='Tenant admins see receipts') then
    create policy "Tenant admins see receipts" on receipts for select using (app.is_tenant_admin(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='receipts' and policyname='Tenant users see job receipts') then
    create policy "Tenant users see job receipts" on receipts for select using (
      auth.role() = 'authenticated'
      and tenant_id = app.current_tenant_id()
      and (
        customer_id = auth.uid()
        or exists (select 1 from providers where providers.id = receipts.provider_id and providers.user_id = auth.uid())
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Tenant users upload job photos') then
    create policy "Tenant users upload job photos" on storage.objects for insert with check (
      bucket_id = 'job-photos' and auth.role() = 'authenticated'
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Tenant users read job photos') then
    create policy "Tenant users read job photos" on storage.objects for select using (
      bucket_id = 'job-photos' and auth.role() = 'authenticated'
    );
  end if;
end $$;
