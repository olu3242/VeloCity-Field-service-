import { Provider } from "./provider-types";

/**
 * Retrieve a provider record by the owning user's ID.
 *
 * `supabase` is typed as `unknown` so this module stays framework-agnostic.
 * Cast it to your Supabase client type at the call site.
 */
export async function getProviderByUserId(
  supabase: unknown,
  userId: string
): Promise<Provider | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Provider | null; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("providers")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Update the lifecycle status of a provider (e.g. approve, suspend).
 */
export async function updateProviderStatus(
  supabase: unknown,
  providerId: string,
  status: Provider["status"]
): Promise<void> {
  const client = supabase as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    };
  };

  const { error } = await client
    .from("providers")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", providerId);

  if (error) {
    throw new Error(
      `Failed to update provider status: ${JSON.stringify(error)}`
    );
  }
}

/**
 * Toggle a provider's online / offline availability flag.
 */
export async function setOnlineStatus(
  supabase: unknown,
  providerId: string,
  isOnline: boolean
): Promise<void> {
  const client = supabase as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    };
  };

  const { error } = await client
    .from("providers")
    .update({ is_online: isOnline, updated_at: new Date().toISOString() })
    .eq("id", providerId);

  if (error) {
    throw new Error(
      `Failed to set online status: ${JSON.stringify(error)}`
    );
  }
}

/**
 * Return aggregate performance stats for a provider.
 */
export async function getProviderStats(
  supabase: unknown,
  providerId: string
): Promise<{
  completedJobs: number;
  totalEarningsCents: number;
  avgRating: number;
}> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Array<{
            completed_jobs: number;
            total_earnings_cents: number;
            avg_rating: number;
          }> | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await client
    .from("provider_stats")
    .select("completed_jobs, total_earnings_cents, avg_rating")
    .eq("provider_id", providerId);

  if (error || !data || data.length === 0) {
    return { completedJobs: 0, totalEarningsCents: 0, avgRating: 0 };
  }

  const row = data[0];
  return {
    completedJobs: row.completed_jobs ?? 0,
    totalEarningsCents: row.total_earnings_cents ?? 0,
    avgRating: row.avg_rating ?? 0,
  };
}
