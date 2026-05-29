import { Identity, Role } from "./identity-types";

/** Maps each role to its allowed permission strings. The admin wildcard ("*") grants all actions. */
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  customer: ["jobs:read:own", "jobs:create", "reviews:create", "payments:read:own"],
  provider: ["jobs:read:assigned", "jobs:update:assigned", "quotes:create", "earnings:read:own"],
  admin: ["*"],
  franchise_owner: [
    "territory:manage",
    "providers:read",
    "revenue:read:own_territory",
    "analytics:read",
  ],
  dispatcher: ["jobs:read:all", "jobs:assign", "providers:read", "dispatch:manage"],
};

const VALID_ROLES: Role[] = ["customer", "provider", "admin", "franchise_owner", "dispatcher"];

/**
 * Resolves a canonical Role from a raw profile role string.
 * Falls back to "customer" when the provided string is not a recognized role.
 *
 * @param userId - The user's ID (reserved for future audit use)
 * @param profileRole - The raw role string stored on the profile
 * @returns A validated Role value
 */
export function resolveRole(userId: string, profileRole: string): Role {
  if (VALID_ROLES.includes(profileRole as Role)) {
    return profileRole as Role;
  }
  return "customer";
}

/**
 * Returns the list of permission strings granted to a given role.
 *
 * @param role - The role to look up
 * @returns Array of permission strings; admin receives ["*"]
 */
export function getRolePermissions(role: Role): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Checks whether an identity holds a specific permission.
 * Admin identities with the wildcard permission ("*") always return true.
 *
 * @param identity - The identity to check
 * @param permission - The permission string to test for
 * @returns true if the identity has the permission
 */
export function hasPermission(identity: Identity, permission: string): boolean {
  if (identity.permissions.includes("*")) {
    return true;
  }
  return identity.permissions.includes(permission);
}

/**
 * Determines whether an identity is allowed to access a given route path.
 * Admin identities always have access. Route access is derived from role-based
 * prefix conventions (/provider/*, /admin/*, /franchise/*, /dispatch/*).
 *
 * @param identity - The identity to evaluate
 * @param route - The route path string (e.g. "/provider/dashboard")
 * @returns true if the identity may access the route
 */
export function canAccessRoute(identity: Identity, route: string): boolean {
  if (identity.role === "admin") {
    return true;
  }

  const routeRoleMap: Array<{ prefix: string; roles: Role[] }> = [
    { prefix: "/admin", roles: ["admin"] },
    { prefix: "/provider", roles: ["provider"] },
    { prefix: "/franchise", roles: ["franchise_owner"] },
    { prefix: "/dispatch", roles: ["dispatcher"] },
    { prefix: "/dashboard", roles: ["customer"] },
  ];

  for (const entry of routeRoleMap) {
    if (route.startsWith(entry.prefix)) {
      return entry.roles.includes(identity.role);
    }
  }

  // Public or unclassified routes are accessible to all authenticated users.
  return true;
}
