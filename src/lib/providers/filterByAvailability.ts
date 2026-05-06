export function filterByAvailability<T extends { id: string }>(providers: T[], availabilityRows: Array<{ provider_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }>, when = new Date()) {
  const day = when.getDay();
  const hhmm = when.toTimeString().slice(0, 8);
  const availableIds = new Set(
    availabilityRows
      .filter((row) => row.is_active && row.day_of_week === day && row.start_time <= hhmm && row.end_time >= hhmm)
      .map((row) => row.provider_id)
  );
  if (!availabilityRows.length) return providers;
  return providers.filter((provider) => availableIds.has(provider.id));
}
