import { distanceMeters, getJobCoordinates } from "@/lib/location/geoUtils";

export function filterByRadius<T extends { id: string; last_location?: { x?: number; y?: number; latitude?: number; longitude?: number } | null }>(
  providers: T[],
  settings: Array<{ provider_id: string; service_radius_km: number }>,
  job: Record<string, unknown>
) {
  const jobCoordinates = getJobCoordinates(job);
  if (!jobCoordinates) return providers;
  const settingsByProvider = new Map(settings.map((row) => [row.provider_id, row.service_radius_km]));
  return providers.filter((provider) => {
    const location = provider.last_location;
    const latitude = location?.latitude ?? location?.y;
    const longitude = location?.longitude ?? location?.x;
    if (typeof latitude !== "number" || typeof longitude !== "number") return true;
    const radiusKm = settingsByProvider.get(provider.id) ?? 40;
    return distanceMeters({ latitude, longitude }, jobCoordinates) <= radiusKm * 1000;
  });
}
