/**
 * Tenant isolation middleware utilities for API routes.
 *
 * All user-facing API routes should gate behind one of these helpers before
 * touching any database table. The helpers combine authentication, role
 * enforcement, and tenant resolution into a single call so callers cannot
 * accidentally skip a step.
 *
 * Usage:
 *   const { ctx, error } = await requireAdminTenant(request);
 *   if (error) return error;
 *   // ctx.userId, ctx.tenantId, ctx.role are now safe to use
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getAdminClient } from "@/lib/supabase/admin";

export interface AdminTenantContext {
  userId: string;
  tenantId: string;
  role: string;
}

type GuardResult =
  | { ctx: AdminTenantContext; error: null }
  | { ctx: null; error: NextResponse };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function authenticate(): Promise<
  | { user: { id: string }; error: null }
  | { user: null; error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, error: null };
}

async function fetchProfile(userId: string): Promise<
  | { profile: { role: string; tenant_id: string | null }; error: null }
  | { profile: null; error: NextResponse }
> {
  // Use the server client (anon key + cookie) for the profile lookup so we
  // respect RLS and don't need the service role key for ordinary auth checks.
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return {
      profile: null,
      error: NextResponse.json({ error: "Profile not found" }, { status: 403 }),
    };
  }

  return { profile, error: null };
}

// ---------------------------------------------------------------------------
// Public guards
// ---------------------------------------------------------------------------

/**
 * Require the caller to be authenticated AND hold the "admin" role.
 * If `allowSuperAdmin` is true, "super_admin" role is also accepted.
 *
 * On success, resolves tenantId via strict getTenantId (throws if missing).
 */
export async function requireAdminTenant(
  _request: NextRequest,
  allowSuperAdmin = false,
): Promise<GuardResult> {
  const authResult = await authenticate();
  if (authResult.error) return { ctx: null, error: authResult.error };
  const { user } = authResult;

  const profileResult = await fetchProfile(user.id);
  if (profileResult.error) return { ctx: null, error: profileResult.error };
  const { profile } = profileResult;

  const allowedRoles = allowSuperAdmin
    ? ["admin", "super_admin"]
    : ["admin"];

  if (!allowedRoles.includes(profile.role)) {
    return {
      ctx: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  let tenantId: string;
  try {
    tenantId = getTenantId(profile);
  } catch {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: "Tenant resolution failed — user has no tenant assignment" },
        { status: 500 },
      ),
    };
  }

  return {
    ctx: { userId: user.id, tenantId, role: profile.role },
    error: null,
  };
}

/**
 * Require the caller to be authenticated AND hold the "provider" role.
 */
export async function requireProviderTenant(
  _request: NextRequest,
): Promise<GuardResult> {
  const authResult = await authenticate();
  if (authResult.error) return { ctx: null, error: authResult.error };
  const { user } = authResult;

  const profileResult = await fetchProfile(user.id);
  if (profileResult.error) return { ctx: null, error: profileResult.error };
  const { profile } = profileResult;

  if (profile.role !== "provider") {
    return {
      ctx: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  let tenantId: string;
  try {
    tenantId = getTenantId(profile);
  } catch {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: "Tenant resolution failed — user has no tenant assignment" },
        { status: 500 },
      ),
    };
  }

  return {
    ctx: { userId: user.id, tenantId, role: profile.role },
    error: null,
  };
}

/**
 * Require the caller to be authenticated (any role).
 * Use this for routes that are role-agnostic but must block unauthenticated
 * callers and still surface the tenant context.
 */
export async function requireAuth(
  _request: NextRequest,
): Promise<GuardResult> {
  const authResult = await authenticate();
  if (authResult.error) return { ctx: null, error: authResult.error };
  const { user } = authResult;

  const profileResult = await fetchProfile(user.id);
  if (profileResult.error) return { ctx: null, error: profileResult.error };
  const { profile } = profileResult;

  let tenantId: string;
  try {
    tenantId = getTenantId(profile);
  } catch {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: "Tenant resolution failed — user has no tenant assignment" },
        { status: 500 },
      ),
    };
  }

  return {
    ctx: { userId: user.id, tenantId, role: profile.role },
    error: null,
  };
}

/**
 * Assert that a resource in `table` with `resourceId` belongs to `tenantId`.
 *
 * Uses the admin client to bypass RLS so this check is authoritative even
 * for tables where the calling user's RLS policy might otherwise allow access
 * across tenants.
 *
 * Returns `true` if the resource belongs to the tenant, `false` otherwise
 * (including when the resource does not exist).
 */
export async function assertResourceBelongsToTenant(
  table: string,
  resourceId: string,
  tenantId: string,
): Promise<boolean> {
  const adminClient = getAdminClient();

  const { data, error } = await adminClient
    .from(table)
    .select("tenant_id")
    .eq("id", resourceId)
    .single();

  if (error || !data) return false;

  return (data as { tenant_id?: string | null }).tenant_id === tenantId;
}
