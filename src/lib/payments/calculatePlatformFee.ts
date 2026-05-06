export function calculatePlatformFee(amountCents: number): number {
  if (amountCents <= 0) return 0;
  if (amountCents < 10000) return Math.round(amountCents * 0.2);
  if (amountCents <= 50000) return Math.round(amountCents * 0.18);
  return Math.round(amountCents * 0.15);
}
