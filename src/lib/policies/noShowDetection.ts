export function detectProviderNoShow(input: { status: string; arrivalTime?: string | null; scheduledStart?: string | null; now?: Date }) {
  if (input.arrivalTime) return { noShow: false, late: false, reason: "Provider arrived." };
  if (!input.scheduledStart || !["scheduled", "en_route"].includes(input.status)) return { noShow: false, late: false, reason: "No scheduled arrival window." };
  const lateMs = (input.now ?? new Date()).getTime() - new Date(input.scheduledStart).getTime();
  return {
    noShow: lateMs > 45 * 60_000,
    late: lateMs > 15 * 60_000,
    reason: lateMs > 45 * 60_000 ? "Provider no-show threshold exceeded." : lateMs > 15 * 60_000 ? "Provider is late." : "Provider is within arrival window.",
  };
}
