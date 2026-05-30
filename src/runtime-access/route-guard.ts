import { RouteGuardResult } from "./access-types";

/** Maps each role to its default home route after authentication. */
export const ROLE_HOME_ROUTES: Record<string, string> = {
  customer: "/dashboard",
  provider: "/provider/dashboard",
  admin: "/admin/dashboard",
  franchise_owner: "/franchise/dashboard",
  dispatcher: "/dispatch/dashboard",
};

/**
 * Determines whether a user with the given role is allowed to access a route
 * restricted to a specific set of roles.
 *
 * @param role - The current user's role, or null if unauthenticated
 * @param allowedRoles - The roles that are permitted to access the route
 * @returns A RouteGuardResult indicating access and, if denied, a redirect path
 */
export function guardRoute(
  role: string | null,
  allowedRoles: string[]
): RouteGuardResult {
  if (!role) {
    return {
      allowed: false,
      redirectTo: "/auth/login",
      reason: "User is not authenticated",
    };
  }

  if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    redirectTo: getDefaultRedirect(role),
    reason: `Role "${role}" is not authorized to access this route`,
  };
}

/**
 * Returns the default home path for a given role.
 * Falls back to "/dashboard" for unrecognized roles.
 *
 * @param role - The role string to look up, or null for unauthenticated users
 * @returns The redirect path string
 */
export function getDefaultRedirect(role: string | null): string {
  if (!role) {
    return "/auth/login";
  }
  return ROLE_HOME_ROUTES[role] ?? "/dashboard";
}
