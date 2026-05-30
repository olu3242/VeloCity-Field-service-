import { AuthUser } from "./auth-types";

/**
 * Fetches a user profile from the database by user ID.
 *
 * @param supabase - Supabase client instance
 * @param userId - The UUID of the user to retrieve
 * @returns The user profile, or null if not found
 */
export async function getProfile(
  supabase: unknown,
  userId: string
): Promise<AuthUser | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: AuthUser | null; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Creates or updates a user profile record in the database.
 *
 * @param supabase - Supabase client instance
 * @param userId - The UUID of the user
 * @param data - Partial profile fields to write
 * @returns The resulting full profile record
 */
export async function upsertProfile(
  supabase: unknown,
  userId: string,
  data: Partial<AuthUser>
): Promise<AuthUser> {
  const client = supabase as {
    from: (table: string) => {
      upsert: (record: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: AuthUser | null; error: unknown }>;
        };
      };
    };
  };

  const { data: result, error } = await client
    .from("profiles")
    .upsert({ ...data, id: userId })
    .select("*")
    .single();

  if (error || !result) {
    throw new Error(`Failed to upsert profile for user ${userId}: ${String(error)}`);
  }

  return result;
}

/**
 * Updates the role field for a given user profile.
 *
 * @param supabase - Supabase client instance
 * @param userId - The UUID of the user
 * @param role - The new role to assign
 */
export async function updateRole(
  supabase: unknown,
  userId: string,
  role: AuthUser["role"]
): Promise<void> {
  const client = supabase as {
    from: (table: string) => {
      update: (record: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    };
  };

  const { error } = await client
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update role for user ${userId}: ${String(error)}`);
  }
}

/**
 * Reads and returns the role for a given user ID from their profile.
 *
 * @param supabase - Supabase client instance
 * @param userId - The UUID of the user
 * @returns The user's current role
 */
export async function resolveRole(
  supabase: unknown,
  userId: string
): Promise<AuthUser["role"]> {
  const profile = await getProfile(supabase, userId);

  if (!profile) {
    return "customer";
  }

  return profile.role;
}
