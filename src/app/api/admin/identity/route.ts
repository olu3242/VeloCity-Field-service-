// GET  /api/admin/identity — the calling admin's resolved identity, portal map
// POST /api/admin/identity — resolve_self | resolve_role | resolve_tenant | portal_for_role
// Admin-only.
//
// Identity resolution reads through the caller's own RLS-scoped client, so a lookup of another
// user only succeeds when the database already permits it. Resolving *your own* identity is
// always safe; resolving someone else's is restricted to super_admin, because
// resolveRole/resolveTenant take an arbitrary userId and would otherwise let any tenant admin
// enumerate roles and tenant assignments across the platform.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  resolveIdentity,
  resolveUser,
  resolveRole,
  resolveTenant,
  getPortalForRole,
  ROLE_PORTAL_MAP,
} from "@/lib/identity";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ROLES = Object.keys(ROLE_PORTAL_MAP) as UserRole[];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, supabase: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, supabase, userId: user.id };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const identity = await resolveIdentity(auth.supabase);

  return NextResponse.json({
    identity,
    // getTenantId is strict where resolveIdentity falls back to a default, so a
    // divergence here means the profile's tenant assignment needs attention.
    strictTenantId: tenantId,
    tenantResolutionConsistent: identity.user?.tenantId === tenantId,
    portal: identity.user ? getPortalForRole(identity.user.role) : null,
    portalMap: ROLE_PORTAL_MAP,
    supportedRoles: VALID_ROLES,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.supabase || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const supabase = auth.supabase;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "resolve_self") {
    const identity = await resolveIdentity(supabase);
    const lightweight = await resolveUser(supabase);
    return NextResponse.json({
      action,
      identity,
      lightweight,
      portal: identity.user ? getPortalForRole(identity.user.role) : null,
      success: identity.authenticated,
    });
  }

  if (action === "resolve_role" || action === "resolve_tenant") {
    const { userId } = raw;
    if (typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Resolving your own is always permitted; resolving another user's role or
    // tenant assignment is a directory read across the platform.
    if (userId !== auth.userId && !isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "Forbidden — resolving another user's role or tenant requires super_admin. Pass your own userId, or use 'resolve_self'.",
        },
        { status: 403 }
      );
    }

    // Confirm the profile is visible through the caller's RLS-scoped client.
    // resolveRole and resolveTenant both fall back to a default when the profile
    // is missing, which would otherwise report "customer" and the default tenant
    // for a user id that does not exist.
    const { data: exists } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (action === "resolve_role") {
      const role = await resolveRole(supabase, userId);
      return NextResponse.json({
        action,
        userId,
        role,
        portal: getPortalForRole(role),
        success: true,
      });
    }

    const resolvedTenant = await resolveTenant(supabase, userId);
    return NextResponse.json({ action, userId, tenantId: resolvedTenant, success: true });
  }

  if (action === "portal_for_role") {
    const { role } = raw;
    if (!VALID_ROLES.includes(role as UserRole)) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action,
      role,
      portal: getPortalForRole(role as UserRole),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'resolve_self', 'resolve_role', 'resolve_tenant', or 'portal_for_role'.`,
    },
    { status: 400 }
  );
}
