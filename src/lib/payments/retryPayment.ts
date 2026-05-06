export function shouldRetryPayment(retryCount: number) {
  return retryCount < 3;
}

export function nextRetryAt(retryCount: number) {
  return new Date(Date.now() + Math.max(1, retryCount + 1) * 15 * 60_000).toISOString();
}
