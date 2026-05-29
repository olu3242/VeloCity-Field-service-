-- Migration 015: Auth & Queue Hardening
-- 1. Auto-create profile on auth.users insert (fixes P0-1: user creation)
-- 2. Drop actor_id FK on automation_events (fixes P0-2: FK violations from automation processes)
-- 3. Ensure automation_queue + automation_events service-role INSERT bypass is documented
-- Additive / safe — no destructive changes to existing data.

-- ─── 1. Profile auto-creation trigger ────────────────────────────────────────
-- When Supabase Auth creates a new user, automatically create a matching profiles
-- row with the default tenant and 'customer' role. This prevents auth callback
-- from silently failing when profiles row is missing.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, tenant_id, role, full_name, avatar_url)
  values (
    new.id,
    app.default_tenant_id(),
    'customer',
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop and re-create trigger to be idempotent
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. Drop FK constraint on automation_events.actor_id ──────────────────────
-- Automation processes (cron, webhooks, background workers) emit events without
-- a human actor. The references profiles(id) FK prevents this. Drop it so that
-- actor_id is a soft reference — the application enforces valid actor_ids when
-- they are user-sourced.
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name = 'automation_events'
    and kcu.column_name = 'actor_id';

  if fk_name is not null then
    execute 'alter table public.automation_events drop constraint ' || quote_ident(fk_name);
  end if;
end $$;

-- ─── 3. Service-role bypass policy for automation_events and automation_queue ──
-- The admin (service_role) client already bypasses RLS. These explicit policies
-- ensure service-role writes also work correctly when invoked via RLS-aware path.
-- Using DO block to avoid errors if policies already exist.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'automation_events'
    and policyname = 'Service role can manage automation events'
  ) then
    create policy "Service role can manage automation events"
      on automation_events for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'automation_queue'
    and policyname = 'Service role can manage automation queue'
  ) then
    create policy "Service role can manage automation queue"
      on automation_queue for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'automation_runs'
    and policyname = 'Service role can manage automation runs'
  ) then
    create policy "Service role can manage automation runs"
      on automation_runs for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- ─── 4. Ensure profiles has RLS policies for own-row access ──────────────────
alter table profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on profiles for select
      using (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on profiles for update
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Service role can manage profiles'
  ) then
    create policy "Service role can manage profiles"
      on profiles for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
