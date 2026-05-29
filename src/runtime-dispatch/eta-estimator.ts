/** Average driving speeds by urgency level (miles per hour). */
const SPEED_MPH: Record<string, number> = {
  emergency: 45,
  same_day: 35,
  scheduled: 30,
};

/** Fallback speed when urgency is unrecognised. */
const DEFAULT_SPEED_MPH = 30;

/**
 * Estimate travel time in minutes for a given distance and urgency.
 */
export function estimateETA(distanceMiles: number, urgency: string): number {
  const speed = SPEED_MPH[urgency] ?? DEFAULT_SPEED_MPH;
  const hours = distanceMiles / speed;
  return Math.ceil(hours * 60);
}

/**
 * Estimate the absolute arrival time as a Date.
 */
export function estimateArrivalTime(
  distanceMiles: number,
  urgency: string
): Date {
  const minutes = estimateETA(distanceMiles, urgency);
  const arrival = new Date();
  arrival.setMinutes(arrival.getMinutes() + minutes);
  return arrival;
}

/**
 * Format an ETA in minutes to a human-readable string.
 *
 * Examples:
 *   5   → "~5 min"
 *   75  → "~1 hr 15 min"
 *   60  → "~1 hr"
 *   120 → "~2 hr"
 */
export function formatETA(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `~${hours} hr`;
  }

  return `~${hours} hr ${remainingMinutes} min`;
}
