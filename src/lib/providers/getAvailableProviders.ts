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

  let providerRows = providers ?? [];
  const providerIds = providerRows.map((provider) => provider.id);

  // Service Catalog: when the job specifies a service_type_id, narrow to
  // providers with a matching capability row. Providers with no capability
  // rows at all keep the existing categories[]-only eligibility (fallback)
  // so this is purely additive — providers that have never been mapped into
  // the capability layer are unaffected.
  const serviceTypeId = input.job.service_type_id as string | null | undefined;
  if (serviceTypeId && providerIds.length) {
    const { data: capabilities } = await input.supabase
      .from("provider_service_capabilities")
      .select("provider_id, service_type_id")
      .eq("tenant_id", input.tenantId)
      .in("provider_id", providerIds);

    const mappedProviderIds = new Set((capabilities ?? []).map((row) => row.provider_id));
    const qualifiedProviderIds = new Set(
      (capabilities ?? [])
        .filter((row) => row.service_type_id === serviceTypeId)
        .map((row) => row.provider_id)
    );
    providerRows = providerRows.filter(
      (provider) => !mappedProviderIds.has(provider.id) || qualifiedProviderIds.has(provider.id)
    );
  }

  // Provider Eligibility Engine: commercial-tier jobs require an active
  // Gold/Elite certification in this job's category (computed by
  // evaluateProviderCertification from real job/rating/trust evidence —
  // never manually assigned). Non-commercial jobs are unaffected; providers
  // with no certification row at all remain eligible for non-commercial work.
  const servicePackageId = input.job.service_package_id as string | null | undefined;
  if (servicePackageId && providerRows.length) {
    const { data: servicePackage } = await input.supabase
      .from("service_packages")
      .select("tier")
      .eq("id", servicePackageId)
      .maybeSingle();

    if (servicePackage?.tier === "commercial") {
      const { data: certifications } = await input.supabase
        .from("provider_certifications")
        .select("provider_id, tier")
        .eq("category", input.category)
        .eq("is_active", true)
        .in("provider_id", providerRows.map((provider) => provider.id));

      const eligibleProviderIds = new Set(
        (certifications ?? [])
          .filter((row) => row.tier === "gold" || row.tier === "elite")
          .map((row) => row.provider_id)
      );
      providerRows = providerRows.filter((provider) => eligibleProviderIds.has(provider.id));
    }
  }

  const filteredProviderIds = providerRows.map((provider) => provider.id);
  const [{ data: availability }, { data: settings }, { data: todaysJobs }] = await Promise.all([
    input.supabase.from("provider_availability").select("*").eq("tenant_id", input.tenantId).in("provider_id", filteredProviderIds.length ? filteredProviderIds : ["00000000-0000-0000-0000-000000000000"]),
    input.supabase.from("provider_settings").select("*").eq("tenant_id", input.tenantId).in("provider_id", filteredProviderIds.length ? filteredProviderIds : ["00000000-0000-0000-0000-000000000000"]),
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
