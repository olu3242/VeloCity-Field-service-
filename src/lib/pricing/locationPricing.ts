export function calculateLocationAdjustment(basePrice: number, state?: string | null, zip?: string | null): number {
  const highCostStates = new Set(["CA", "NY", "MA", "WA", "DC"]);
  const ruralZip = zip ? Number(zip.slice(0, 3)) < 100 : false;
  if (state && highCostStates.has(state.toUpperCase())) return Math.round(basePrice * 0.12);
  if (ruralZip) return Math.round(basePrice * 0.08);
  return 0;
}
