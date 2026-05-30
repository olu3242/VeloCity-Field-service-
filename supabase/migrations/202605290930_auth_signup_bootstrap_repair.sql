-- ============================================================
-- Migration: Auth Signup Bootstrap Repair
-- Date: 2026-05-29
-- Purpose: Fix "Database error saving new user" on signup
--
-- Root causes addressed:
--   1. handle_new_user() had no exception handler — any error
--      (UUID cast failure, FK violation, race condition) caused
--      Supabase to return "Database error saving new user"
--   2. raw_user_meta_data->>'tenant_id' cast to uuid without
--      error handling — invalid UUID format raises exception
--   3. No validation that tenant UUID exists in tenants table
--      before inserting into profiles (FK violation path)
--   4. Missing ON CONFLICT in earlier versions caused failures
--      on duplicate signup attempts
--   5. public.users legacy references (guarded but noisy)
--
-- This migration is:
--   - Idempotent (safe to run multiple times)
--   - Non-destructive (no data loss)
--   - Additive only
-- ============================================================

-- ── 0. Ensure the default tenant exists ───────────────────────────────────────
-- Guard: if tenants table doesn't exist yet, skip silently.
-- This covers the edge case where migrations run out of order in staging.
do $$
begin
  if to_regclass('public.tenants') is not null then
    insert into public.tenants (id, slug, name)
    values (
      '00000000-0000-4000-8000-000000000001',
      'velocity-default',
      'VeloCity Default Tenant'
    )
    on conflict (id) do nothing;
  end if;
end $$;

-- ── 1. Bulletproof handle_new_user() ──────────────────────────────────────────
-- Rules:
--   a. Never let this trigger function fail — if profile creation fails for
--      any reason, log a WARNING and still RETURN new so auth.users insert
--      always succeeds. Silent profile failure is fixable; blocked signup is not.
--   b. Safely parse tenant_id from metadata — wrap the ::uuid cast in a
--      nested BEGIN/EXCEPTION block so an invalid format doesn't crash.
--   c. Validate the parsed tenant UUID exists in tenants before using it;
--      fall back to the hardcoded default UUID if not found.
--   d. Use ON CONFLICT (id) DO NOTHING — idempotent for retry scenarios.
--   e. Set search_path = public, app — ensures both schemas are accessible
--      without relying on the session search_path at trigger invocation time.
--   f. Use SECURITY DEFINER so the function runs with elevated privileges
--      needed to write to profiles from within auth schema trigger context.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant_id  uuid;
  v_full_name  text;
  v_avatar_url text;
begin
  -- ── Parse tenant_id from signup metadata ──────────────────────────────────
  -- Wrap cast in nested block so invalid UUID strings don't propagate up.
  begin
    v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  exception when others then
    v_tenant_id := null;
  end;

  -- ── Validate tenant exists; fall back to hardcoded default ────────────────
  -- Using hardcoded UUID literal rather than app.default_tenant_id() call
  -- to eliminate any schema-resolution dependency at trigger time.
  if v_tenant_id is null
     or not exists (select 1 from public.tenants where id = v_tenant_id) then
    v_tenant_id := '00000000-0000-4000-8000-000000000001'::uuid;
  end if;

  -- ── Derive display fields ─────────────────────────────────────────────────
  v_full_name  := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );
  v_avatar_url := new.raw_user_meta_data->>'avatar_url';

  -- ── Insert profile row ────────────────────────────────────────────────────
  insert into public.profiles (id, tenant_id, role, full_name, avatar_url)
  values (new.id, v_tenant_id, 'customer', v_full_name, v_avatar_url)
  on conflict (id) do nothing;

  return new;

exception when others then
  -- ── Safety net: profile creation must never block auth user creation ───────
  -- Log details so the error is traceable in Supabase logs, but always
  -- succeed so the auth.users row is committed.
  raise warning 'handle_new_user: profile bootstrap failed for user_id=% email=% error="%"',
    new.id, new.email, sqlerrm;
  return new;
end;
$$;

-- ── 2. Recreate trigger idempotently ──────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ── 3. Harden app.current_tenant_id() ────────────────────────────────────────
-- Replace with a version that:
--   a. Removes public.users fallback (legacy table never deployed in this schema)
--   b. Has its own EXCEPTION handler so a bad JWT or missing profile never 500s
--   c. Sets explicit search_path

create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_jwt_tenant     uuid;
  v_profile_tenant uuid;
begin
  -- Path 1: JWT claim (fastest — used in production with custom JWT hook)
  begin
    v_jwt_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  exception when others then
    v_jwt_tenant := null;
  end;
  if v_jwt_tenant is not null then
    return v_jwt_tenant;
  end if;

  -- Path 2: profiles table (canonical user model)
  if to_regclass('public.profiles') is not null then
    begin
      execute 'select tenant_id from public.profiles where id = $1 limit 1'
        into v_profile_tenant using auth.uid();
    exception when others then
      v_profile_tenant := null;
    end;
    if v_profile_tenant is not null then
      return v_profile_tenant;
    end if;
  end if;

  -- Path 3: hardcoded default
  return '00000000-0000-4000-8000-000000000001'::uuid;
end;
$$;

-- ── 4. Harden app.is_tenant_admin() ──────────────────────────────────────────
-- Remove public.users fallback; profiles-only check with exception safety.

create or replace function app.is_tenant_admin(target_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_is_admin boolean := false;
begin
  if to_regclass('public.profiles') is not null then
    begin
      execute 'select exists(select 1 from public.profiles where id = $1 and role = ''admin'' and tenant_id = $2)'
        into v_is_admin using auth.uid(), target_tenant_id;
    exception when others then
      v_is_admin := false;
    end;
  end if;
  return coalesce(v_is_admin, false);
end;
$$;

-- ── 5. Backfill any auth.users rows that have no profiles row ─────────────────
-- Repairs accounts created before the trigger existed or before this migration.
-- Only runs if both tables exist and the default tenant is present.
do $$
begin
  if to_regclass('public.profiles') is not null
     and to_regclass('public.tenants') is not null
     and exists (
       select 1 from public.tenants
       where id = '00000000-0000-4000-8000-000000000001'::uuid
     ) then
    insert into public.profiles (id, tenant_id, role, full_name, avatar_url)
    select
      au.id,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'customer',
      coalesce(
        nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
        split_part(au.email, '@', 1)
      ),
      au.raw_user_meta_data->>'avatar_url'
    from auth.users au
    where not exists (
      select 1 from public.profiles p where p.id = au.id
    );
  end if;
end $$;

-- ── 6. Ensure profiles INSERT policy exists for authenticated users ────────────
-- Without this, the trigger (SECURITY DEFINER) can insert, but users
-- cannot see their own newly created profile via the anon/authenticated role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename   = 'profiles'
      and policyname  = 'Users can insert own profile'
  ) then
    execute $policy$
      create policy "Users can insert own profile"
        on public.profiles
        for insert
        to authenticated
        with check (id = auth.uid())
    $policy$;
  end if;
end $$;

-- ── Verification queries (run after migration to confirm state) ───────────────
-- 1. Trigger exists:
--    select tgname, tgrelid::regclass, tgfoid::regprocedure
--    from pg_trigger
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- 2. Function body (confirm no public.users references):
--    select pg_get_functiondef('public.handle_new_user()'::regprocedure);
--
-- 3. Default tenant exists:
--    select id, slug, name from public.tenants
--    where id = '00000000-0000-4000-8000-000000000001';
--
-- 4. Profiles count (regression check):
--    select count(*) from public.profiles;
