import { distanceMeters, type Coordinates } from "./geoUtils";

export interface ProximityResult {
  valid: boolean;
  distanceMeters: number | null;
  reason: string;
}

export function validateProximity(input: {
  provider: Coordinates;
  job: Coordinates | null;
  maxDistanceMeters?: number;
}): ProximityResult {
  if (!input.job) {
    return { valid: true, distanceMeters: null, reason: "Job coordinates unavailable; proximity check recorded but not enforced." };
  }
  const distance = distanceMeters(input.provider, input.job);
  const maxDistance = input.maxDistanceMeters ?? 200;
  return {
    valid: distance <= maxDistance,
    distanceMeters: Math.round(distance),
    reason: distance <= maxDistance ? "Provider is within allowed arrival radius." : `Provider is ${Math.round(distance)}m from job; max is ${maxDistance}m.`,
  };
}
