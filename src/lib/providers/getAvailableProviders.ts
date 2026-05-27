import type { SupabaseClient } from "@supabase/supabase-js";
import { filterByAvailability } from "./filterByAvailability";
import { filterByRadius } from "./filterByRadius";

export async function getAvailableProviders(input: {
  supabase: SupabaseClient;
  tenantId: string;
  job: Record<string, unknown>;
  category: string;
}) {
  const { data: providers } = await input.supabase
    .from("providers")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("status", "approved")
    .eq("is_online", true)
    .contains("categories", [input.category]);

  const providerRows = providers ?? [];
  const providerIds = providerRows.map((provider) => provider.id);
  const [{ data: availability }, { data: settings }, { data: todaysJobs }] = await Promise.all([
    input.supabase.from("provider_availability").select("*").eq("tenant_id", input.tenantId).in("provider_id", providerIds.length ? providerIds : ["00000000-0000-0000-0000-000000000000"]),
    input.supabase.from("provider_settings").select("*").eq("tenant_id", input.tenantId).in("provider_id", providerIds.length ? providerIds : ["00000000-0000-0000-0000-000000000000"]),
    input.supabase.from("jobs").select("provider_id").eq("tenant_id", input.tenantId).gte("created_at", new Date().toISOString().slice(0, 10)),
  ]);

  const activeCounts = new Map<string, number>();
  (todaysJobs ?? []).forEach((job) => {
    if (job.provider_id) activeCounts.set(job.provider_id, (activeCounts.get(job.provider_id) ?? 0) + 1);
  });
  const maxByProvider = new Map((settings ?? []).map((row) => [row.provider_id, row.max_jobs_per_day ?? 4]));
  const capacityFiltered = providerRows.filter((provider) => (activeCounts.get(provider.id) ?? 0) < (maxByProvider.get(provider.id) ?? 4));
  return filterByRadius(filterByAvailability(capacityFiltered, availability ?? []), settings ?? [], input.job);
}
