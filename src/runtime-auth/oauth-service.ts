import { AuthResult, AuthUser } from "./auth-types";

/**
 * Generates a Google OAuth authorization URL for initiating the OAuth flow.
 *
 * @param supabase - Supabase client instance
 * @param redirectTo - The callback URL to redirect to after OAuth completes
 * @returns The authorization URL string, or null if generation fails
 */
export async function getGoogleOAuthUrl(
  supabase: unknown,
  redirectTo: string
): Promise<string | null> {
  const client = supabase as {
    auth: {
      signInWithOAuth: (options: {
        provider: string;
        options: { redirectTo: string; queryParams?: Record<string, string> };
      }) => Promise<{ data: { url: string | null }; error: unknown }>;
    };
  };

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    return null;
  }

  return data.url;
}

/**
 * Exchanges an OAuth authorization code for a session and user profile.
 *
 * @param supabase - Supabase client instance
 * @param code - The authorization code received from the OAuth provider
 * @returns An AuthResult containing user/session on success or an error message
 */
export async function exchangeOAuthCode(
  supabase: unknown,
  code: string
): Promise<AuthResult> {
  const client = supabase as {
    auth: {
      exchangeCodeForSession: (code: string) => Promise<{
        data: {
          session: {
            user: {
              id: string;
              email?: string;
              user_metadata: Record<string, unknown>;
              created_at: string;
            };
            access_token: string;
            refresh_token: string;
            expires_at: number;
          } | null;
        };
        error: { message: string } | null;
      }>;
    };
  };

  const { data, error } = await client.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return {
      success: false,
      error: error?.message ?? "OAuth code exchange failed",
    };
  }

  const raw = data.session;
  const meta = raw.user.user_metadata;

  const user: AuthUser = {
    id: raw.user.id,
    email: raw.user.email ?? "",
    role: (meta.role as AuthUser["role"]) ?? "customer",
    tenantId: String(meta.tenant_id ?? ""),
    fullName: (meta.full_name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? null,
    createdAt: raw.user.created_at,
  };

  return {
    success: true,
    user,
    session: {
      user,
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      expiresAt: raw.expires_at,
    },
  };
}

/**
 * Handles the full OAuth callback flow: exchanges the code and determines
 * where to redirect the user afterward.
 *
 * @param supabase - Supabase client instance
 * @param code - The authorization code from the OAuth provider
 * @param next - The intended destination path after sign-in
 * @returns An object with the resolved redirectTo path
 */
export async function handleOAuthCallback(
  supabase: unknown,
  code: string,
  next: string
): Promise<{ redirectTo: string }> {
  const result = await exchangeOAuthCode(supabase, code);

  if (!result.success || !result.user) {
    return { redirectTo: `/auth/error?reason=${encodeURIComponent(result.error ?? "unknown")}` };
  }

  const roleHome: Record<string, string> = {
    customer: "/dashboard",
    provider: "/provider/dashboard",
    admin: "/admin/dashboard",
  };

  const defaultHome = roleHome[result.user.role] ?? "/dashboard";
  const safeNext = next && next.startsWith("/") ? next : defaultHome;

  return { redirectTo: safeNext };
}
