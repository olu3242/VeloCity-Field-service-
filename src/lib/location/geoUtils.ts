export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export function getJobCoordinates(job: Record<string, unknown>): Coordinates | null {
  const location = job.location as { x?: number; y?: number; longitude?: number; latitude?: number } | null | undefined;
  const latitude = location?.latitude ?? location?.y;
  const longitude = location?.longitude ?? location?.x;
  if (typeof latitude === "number" && typeof longitude === "number") return { latitude, longitude };
  return null;
}
