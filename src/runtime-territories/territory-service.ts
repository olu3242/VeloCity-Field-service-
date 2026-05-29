import { Territory } from "./territory-types";

type SupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: Territory | null; error: unknown }>;
        /* overload without .single() */
      } & Promise<{ data: Territory[] | null; error: unknown }>;
    };
  };
};

/**
 * Look up the territory that contains a given ZIP code.
 *
 * Uses a Postgres array-contains query via Supabase's `cs` filter.
 */
export async function getTerritoryByZip(
  supabase: unknown,
  zip: string
): Promise<Territory | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        contains: (col: string, val: string[]) => {
          single: () => Promise<{ data: Territory | null; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("territories")
    .select("*")
    .contains("zip_codes", [zip])
    .single();

  if (error) return null;
  return data;
}

/**
 * Retrieve all territories owned by a franchise owner.
 */
export async function getTerritoriesForOwner(
  supabase: unknown,
  franchiseOwnerId: string
): Promise<Territory[]> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string
        ) => Promise<{ data: Territory[] | null; error: unknown }>;
      };
    };
  };

  const { data, error } = await client
    .from("territories")
    .select("*")
    .eq("franchise_owner_id", franchiseOwnerId);

  if (error || !data) return [];
  return data;
}

/**
 * Check whether a ZIP code falls within a territory's coverage area.
 */
export function isZipCovered(territory: Territory, zip: string): boolean {
  return territory.zipCodes.includes(zip);
}

/**
 * Fetch aggregate stats for a territory.
 */
export async function getTerritoryStats(
  supabase: unknown,
  territoryId: string
): Promise<{ jobCount: number; revenueCents: number; activeProviders: number }> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string
        ) => Promise<{
          data: Array<{
            job_count: number;
            revenue_cents: number;
            active_providers: number;
          }> | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await client
    .from("territory_stats")
    .select("job_count, revenue_cents, active_providers")
    .eq("territory_id", territoryId);

  if (error || !data || data.length === 0) {
    return { jobCount: 0, revenueCents: 0, activeProviders: 0 };
  }

  const row = data[0];
  return {
    jobCount: row.job_count ?? 0,
    revenueCents: row.revenue_cents ?? 0,
    activeProviders: row.active_providers ?? 0,
  };
}

// Prevent unused-import warning — SupabaseClient is intentionally kept for
// documentation purposes but the runtime uses structural typing via `unknown`.
void (undefined as unknown as SupabaseClient);
