import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getJobCoordinates } from "./geoUtils";
import { validateProximity } from "./validateProximity";

export async function createProviderCheckIn(input: {
  supabase: SupabaseClient;
  tenantId: string;
  job: Record<string, unknown>;
  providerId: string;
  latitude: number;
  longitude: number;
  status?: "arrived" | "departed";
}) {
  const proximity = validateProximity({
    provider: { latitude: input.latitude, longitude: input.longitude },
    job: getJobCoordinates(input.job),
  });

  if (!proximity.valid) {
    return { ok: false, proximity };
  }

  const { data, error } = await input.supabase.from("job_checkins").insert({
    tenant_id: input.tenantId,
    job_id: input.job.id,
    provider_id: input.providerId,
    latitude: input.latitude,
    longitude: input.longitude,
    distance_from_job: proximity.distanceMeters,
    status: input.status ?? "arrived",
    metadata: { reason: proximity.reason },
  }).select().single();

  if (error) return { ok: false, error: error.message, proximity };

  if ((input.status ?? "arrived") === "arrived") {
    await input.supabase.from("jobs").update({ arrival_time: new Date().toISOString(), checked_in_at: new Date().toISOString() }).eq("id", input.job.id).eq("tenant_id", input.tenantId);
    await emitEvent(input.supabase, {
      type: "provider_arrived",
      tenantId: input.tenantId,
      source: "location.checkin",
      entityType: "job",
      entityId: String(input.job.id),
      dedupKey: `provider_arrived:${input.job.id}:${data.id}`,
      payload: { job_id: input.job.id, tenant_id: input.tenantId, provider_id: input.providerId, checkin_id: data.id, distance_meters: proximity.distanceMeters },
    });
  }

  return { ok: true, checkin: data, proximity };
}
