-- ============================================================
-- Migration: Fix profiles search_path in auth trigger functions
-- Date: 2026-05-29
-- SQLSTATE that this resolves: 42P01
-- Error: ERROR: relation "profiles" does not exist
--
-- ROOT CAUSE (confirmed):
--   handle_new_user() in migration 003_tenant_demarcation.sql is the
--   currently active function on staging (migrations 015+ not applied).
--   Its definition is:
--
--     CREATE OR REPLACE FUNCTION handle_new_user()
--     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
--     BEGIN
--       INSERT INTO profiles(id, tenant_id, full_name, avatar_url)  -- ← UNQUALIFIED
--       VALUES (...);
--       RETURN new;
--     END;
--     $$;
--
--   TWO defects cause the 42P01 error:
--
--   1. No SET search_path clause on the SECURITY DEFINER function.
--      When auth.users INSERT fires this trigger, the executing role is
--      supabase_auth_admin whose effective search_path is restricted to
--      the auth schema (or empty). The unqualified identifier "profiles"
--      is not found because public.profiles is not in scope.
--
--   2. "profiles" is not schema-qualified. It must be "public.profiles"
--      to be reachable regardless of the caller's search_path.
--
--   Why does this happen in auth context but not in SQL Editor:
--      In SQL Editor the session search_path is "$user", public so
--      unqualified "profiles" resolves correctly. The trigger fires
--      under supabase_auth_admin which does NOT have public in its
--      effective search_path, so the lookup fails.
--
-- FAILING FUNCTION:  public.handle_new_user()
-- FAILING STATEMENT: INSERT INTO profiles(...)  -- line 315, migration 003
-- FIX: SET search_path = public + qualify as public.profiles + safety net
--
-- ADDITIVE / IDEMPOTENT — no destructive changes, no data loss.
-- ============================================================

-- ── Step 1: Repair handle_new_user() ─────────────────────────────────────────
--
-- Changes from broken version:
--   a. SET search_path = public  — ensures public.profiles is findable even
--      when called from auth schema trigger context (supabase_auth_admin role)
--   b. INSERT INTO public.profiles — explicit schema qualification, belt-and-
--      suspenders protection independent of search_path
--   c. ON CONFLICT (id) DO NOTHING — prevents duplicate-insert failures on
--      retry or race conditions
--   d. EXCEPTION WHEN others THEN RETURN new — outer safety net ensures that
--      even if profile creation fails for any reason, the auth.users INSERT
--      is never blocked. Auth succeeds; profile can be repaired separately.
--   e. Tenant UUID parsed in nested block with its own EXCEPTION handler —
--      an invalid UUID string in raw_user_meta_data no longer crashes signup
--   f. Hardcoded default tenant UUID (no app.default_tenant_id() call needed)
--      eliminates any schema-resolution dependency at trigger invocation time

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public          -- ← THE FIX: force public schema in scope
AS $$
DECLARE
  v_tenant_id  uuid;
  v_full_name  text;
  v_avatar_url text;
BEGIN
  -- Safely parse optional tenant_id from signup metadata.
  -- Nested block so a bad UUID string does not crash the whole trigger.
  BEGIN
    v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN others THEN
    v_tenant_id := NULL;
  END;

  -- Validate the parsed tenant exists; fall back to hardcoded default.
  -- Using literal UUID avoids any dependency on app.default_tenant_id().
  IF v_tenant_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants WHERE id = v_tenant_id
     )
  THEN
    v_tenant_id := '00000000-0000-4000-8000-000000000001'::uuid;
  END IF;

  -- Derive display name: prefer full_name, fall back to name, then email prefix.
  v_full_name  := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(new.email, '@', 1)
  );
  v_avatar_url := new.raw_user_meta_data->>'avatar_url';

  -- Insert profile row. ON CONFLICT handles retries and Google OAuth
  -- re-logins where auth.users already has the row.
  INSERT INTO public.profiles (id, tenant_id, role, full_name, avatar_url)
  VALUES (new.id, v_tenant_id, 'customer', v_full_name, v_avatar_url)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;

EXCEPTION WHEN others THEN
  -- Safety net: profile failure must NEVER block auth user creation.
  -- Warning appears in Supabase Logs → Auth logs for post-hoc diagnosis.
  RAISE WARNING 'handle_new_user: profile bootstrap failed for uid=% email=% sqlerrm="%"',
    new.id, new.email, SQLERRM;
  RETURN new;
END;
$$;

-- ── Step 2: Recreate trigger pointing at repaired function (idempotent) ───────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── Step 3: Harden app.current_tenant_id() ───────────────────────────────────
-- The 003 version uses a direct SELECT (not dynamic SQL) against
-- public.profiles — schema-qualified so it would work, but add an
-- explicit search_path and exception safety for defense-in-depth.
-- The 006/bridge version already uses dynamic SQL with to_regclass() guard.
-- This CREATE OR REPLACE supersedes both.

CREATE OR REPLACE FUNCTION app.current_tenant_id()
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, app
AS $$
DECLARE
  v_jwt_tenant     uuid;
  v_profile_tenant uuid;
BEGIN
  -- Path 1: JWT claim (fastest path; populated by custom JWT hook in prod)
  BEGIN
    v_jwt_tenant := NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_jwt_tenant := NULL;
  END;
  IF v_jwt_tenant IS NOT NULL THEN RETURN v_jwt_tenant; END IF;

  -- Path 2: profiles table (canonical source of truth)
  BEGIN
    SELECT tenant_id INTO v_profile_tenant
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
  EXCEPTION WHEN others THEN
    v_profile_tenant := NULL;
  END;
  IF v_profile_tenant IS NOT NULL THEN RETURN v_profile_tenant; END IF;

  -- Path 3: hardcoded default
  RETURN '00000000-0000-4000-8000-000000000001'::uuid;
END;
$$;

-- ── Step 4: Harden app.is_tenant_admin() ─────────────────────────────────────
-- Remove public.users legacy path; profiles-only with exception safety.

CREATE OR REPLACE FUNCTION app.is_tenant_admin(target_tenant_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, app
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND tenant_id = target_tenant_id
    ) INTO v_is_admin;
  EXCEPTION WHEN others THEN
    v_is_admin := false;
  END;
  RETURN COALESCE(v_is_admin, false);
END;
$$;

-- ── Step 5: Ensure default tenant row exists ──────────────────────────────────
-- Without this row, the tenant_id FK on profiles.tenant_id fails on first signup.
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    INSERT INTO public.tenants (id, slug, name)
    VALUES (
      '00000000-0000-4000-8000-000000000001',
      'velocity-default',
      'VeloCity Default Tenant'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── Step 6: Backfill profiles for any orphaned auth.users rows ────────────────
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     AND to_regclass('public.tenants') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.tenants
       WHERE id = '00000000-0000-4000-8000-000000000001'::uuid
     )
  THEN
    INSERT INTO public.profiles (id, tenant_id, role, full_name, avatar_url)
    SELECT
      au.id,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'customer',
      COALESCE(
        NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
        SPLIT_PART(au.email, '@', 1)
      ),
      au.raw_user_meta_data->>'avatar_url'
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = au.id
    );
  END IF;
END $$;

-- ── Step 7: Ensure profiles has an INSERT policy for authenticated users ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'profiles'
      AND policyname  = 'Users can insert own profile'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Users can insert own profile"
        ON public.profiles
        FOR INSERT
        TO authenticated
        WITH CHECK (id = auth.uid())
    $pol$;
  END IF;
END $$;

-- ============================================================
-- VALIDATION QUERIES (run after applying this migration)
-- ============================================================
--
-- 1. Confirm trigger exists and points to repaired function:
--
--   SELECT t.tgname, t.tgrelid::regclass, p.proname, p.proconfig
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal;
--
--   Expected: tgname=on_auth_user_created, proconfig includes search_path=public
--
-- 2. Confirm search_path is set on repaired function (proconfig NOT NULL):
--
--   SELECT proname, nspname AS schema, proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE proname = 'handle_new_user';
--
--   Expected: proconfig = {search_path=public}  (NOT NULL)
--
-- 3. Confirm no unqualified profiles reference remains in function body:
--
--   SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
--
--   Expected: "public.profiles" appears, no bare "profiles" in INSERT/SELECT
--
-- 4. Confirm default tenant exists:
--
--   SELECT id, slug FROM public.tenants
--   WHERE id = '00000000-0000-4000-8000-000000000001';
--
-- 5. Smoke test — create a test user and verify profile created:
--
--   SELECT au.id, au.email, p.id AS profile_id, p.tenant_id, p.role
--   FROM auth.users au
--   LEFT JOIN public.profiles p ON p.id = au.id
--   ORDER BY au.created_at DESC
--   LIMIT 5;
--
--   Expected: every auth.users row has a matching profiles row with
--   role='customer' and tenant_id='00000000-0000-4000-8000-000000000001'
-- ============================================================
