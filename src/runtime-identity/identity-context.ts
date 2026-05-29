import { Identity, Role, TenantContext } from "./identity-types";
import { getRolePermissions, resolveRole } from "./role-resolver";

/**
 * Constructs a fully resolved Identity from a raw profile record and tenant context.
 *
 * @param userId - The user's UUID
 * @param profile - Raw profile data from the database (arbitrary shape)
 * @param tenantCtx - The resolved TenantContext for this user
 * @returns A complete Identity object with permissions populated
 */
export function buildIdentity(
  userId: string,
  profile: Record<string, unknown>,
  tenantCtx: TenantContext
): Identity {
  const rawRole = String(profile.role ?? "customer");
  const role: Role = resolveRole(userId, rawRole);
  const permissions = getRolePermissions(role);

  return {
    userId,
    email: String(profile.email ?? ""),
    role,
    tenantId: tenantCtx.tenantId,
    organizationId:
      profile.organization_id != null ? String(profile.organization_id) : undefined,
    franchiseId:
      tenantCtx.franchiseId ?? (profile.franchise_id != null ? String(profile.franchise_id) : undefined),
    displayName: String(profile.full_name ?? profile.email ?? "Anonymous"),
    avatarUrl: profile.avatar_url != null ? String(profile.avatar_url) : undefined,
    permissions,
  };
}

/**
 * Returns an anonymous Identity used for unauthenticated contexts.
 * Has no permissions and a placeholder user ID.
 *
 * @returns A zero-permission anonymous Identity
 */
export function getAnonymousIdentity(): Identity {
  return {
    userId: "anonymous",
    email: "",
    role: "customer",
    tenantId: "default",
    displayName: "Anonymous",
    permissions: [],
  };
}
