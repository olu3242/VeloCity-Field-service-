import { AuthSession, AuthUser } from "./auth-types";

/** Maps a raw Supabase session object into the typed AuthSession shape. */
function mapRawSession(raw: Record<string, unknown>): AuthSession {
  const rawUser = (raw.user ?? {}) as Record<string, unknown>;
  const meta = (rawUser.user_metadata ?? {}) as Record<string, unknown>;

  const user: AuthUser = {
    id: String(rawUser.id ?? ""),
    email: String(rawUser.email ?? ""),
    role: (meta.role as AuthUser["role"]) ?? "customer",
    tenantId: String(meta.tenant_id ?? ""),
    fullName: (meta.full_name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? null,
    createdAt: String(rawUser.created_at ?? new Date().toISOString()),
  };

  return {
    user,
    accessToken: String(raw.access_token ?? ""),
    refreshToken: String(raw.refresh_token ?? ""),
    expiresAt: Number(raw.expires_at ?? 0),
  };
}

/**
 * Retrieves the current active session from Supabase.
 *
 * @param supabase - Supabase client instance
 * @returns The current session, or null if unauthenticated
 */
export async function getSession(supabase: unknown): Promise<AuthSession | null> {
  const client = supabase as {
    auth: {
      getSession: () => Promise<{
        data: { session: Record<string, unknown> | null };
        error: unknown;
      }>;
    };
  };

  const { data, error } = await client.auth.getSession();

  if (error || !data.session) {
    return null;
  }

  return mapRawSession(data.session);
}

/**
 * Attempts to refresh the current session using the stored refresh token.
 *
 * @param supabase - Supabase client instance
 * @returns A refreshed session, or null if the refresh fails
 */
export async function refreshSession(supabase: unknown): Promise<AuthSession | null> {
  const client = supabase as {
    auth: {
      refreshSession: () => Promise<{
        data: { session: Record<string, unknown> | null };
        error: unknown;
      }>;
    };
  };

  const { data, error } = await client.auth.refreshSession();

  if (error || !data.session) {
    return null;
  }

  return mapRawSession(data.session);
}

/**
 * Signs out the current user and clears the session.
 *
 * @param supabase - Supabase client instance
 */
export async function destroySession(supabase: unknown): Promise<void> {
  const client = supabase as {
    auth: {
      signOut: () => Promise<{ error: unknown }>;
    };
  };

  const { error } = await client.auth.signOut();

  if (error) {
    throw new Error(`Failed to destroy session: ${String(error)}`);
  }
}

/**
 * Checks whether a session is present and has not expired.
 *
 * @param session - The session to validate, or null
 * @returns true if the session is valid and not expired
 */
export function validateSession(session: AuthSession | null): boolean {
  if (!session) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return session.expiresAt > nowSeconds;
}
